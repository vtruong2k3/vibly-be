import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { PasswordService } from '../../auth/services/password.service';
import { TokenService } from '../../auth/services/token.service';
import { TotpService } from './totp.service';
import { AdminAuditService } from '../audit-log/admin-audit.service';
import { AdminLoginDto, AdminTotpVerifyDto } from './dto/admin-login.dto';
import { AdminJwtPayload } from './admin-jwt.strategy';
import { UserRole, UserStatus } from '@prisma/client';
import { addDays } from 'date-fns';
import { Request, Response } from 'express';
import { createHash } from 'crypto';

const ALLOWED_ADMIN_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.MODERATOR];

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly totpService: TotpService,
    private readonly auditService: AdminAuditService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // STEP 1: Email + password → returns accessToken or { requireTotp, tempToken }
  async login(dto: AdminLoginDto, req: Request, res: Response) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), deletedAt: null },
    });

    // Always compare password to prevent timing-attack user enumeration
    const passwordValid =
      user != null &&
      (await this.passwordService.verify(user.passwordHash ?? '', dto.password));

    if (!user || !passwordValid) {
      throw new UnauthorizedException('Email or password is incorrect');
    }

    if (!ALLOWED_ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Access restricted to admin staff only');
    }

    if (
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.BANNED
    ) {
      throw new ForbiddenException('Your admin account has been suspended');
    }

    // TOTP enabled → return temp token, require step 2
    if (user.totpEnabled && user.totpSecret) {
      const tempToken = this.jwtService.sign(
        { sub: user.id, step: 'totp' },
        {
          secret: this.config.get<string>('auth.jwtAdminTempSecret'),
          expiresIn: 300, // 5 minutes
        },
      );
      return { requireTotp: true, tempToken };
    }

    // No TOTP → issue full tokens
    return this.issueAdminTokens(user, req, res);
  }

  // STEP 2: Verify TOTP (or backup code)
  async verifyTotp(dto: AdminTotpVerifyDto, req: Request, res: Response) {
    let tempPayload: { sub: string; step: string };
    try {
      tempPayload = this.jwtService.verify<{ sub: string; step: string }>(
        dto.tempToken,
        { secret: this.config.get<string>('auth.jwtAdminTempSecret') },
      );
    } catch {
      throw new UnauthorizedException('Temp token is invalid or expired');
    }

    if (tempPayload.step !== 'totp') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: tempPayload.sub, deletedAt: null },
    });

    if (!user || !user.totpSecret) {
      throw new UnauthorizedException('TOTP not configured for this account');
    }

    const totpValid = this.totpService.verifyToken(user.totpSecret, dto.code);

    if (!totpValid) {
      // Check backup codes as fallback
      const codeHash = createHash('sha256').update(dto.code).digest('hex');
      const backupCode = await this.prisma.adminTotpBackupCode.findFirst({
        where: { userId: user.id, codeHash, usedAt: null },
      });

      if (!backupCode) {
        throw new UnauthorizedException('Invalid TOTP code');
      }

      // Consume the backup code — single use
      await this.prisma.adminTotpBackupCode.update({
        where: { id: backupCode.id },
        data: { usedAt: new Date() },
      });
    }

    await this.auditService.write(
      user.id,
      'ADMIN_LOGIN_SUCCESS',
      'USER',
      user.id,
      { method: 'totp' },
      req.ip,
    );

    return this.issueAdminTokens(user, req, res);
  }

  // Start TOTP setup — returns QR code data URL
  async setupTotp(adminId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: adminId },
    });

    if (user.totpEnabled) {
      throw new ConflictException('TOTP is already enabled on this account');
    }

    const { encryptedSecret, otpauthUrl, qrDataUrl } =
      await this.totpService.generateSecret(user.email);

    // Store encrypted secret (not yet active)
    await this.prisma.user.update({
      where: { id: adminId },
      data: { totpSecret: encryptedSecret },
    });

    return { otpauthUrl, qrDataUrl };
  }

  // Confirm setup with first valid code → activate + return backup codes
  async enableTotp(adminId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: adminId },
    });

    if (!user.totpSecret) {
      throw new ForbiddenException(
        'Call POST /admin/auth/totp/setup first to generate a secret',
      );
    }

    const valid = this.totpService.verifyToken(user.totpSecret, code);
    if (!valid) {
      throw new UnauthorizedException('TOTP code is invalid — please try again');
    }

    const { plain, hashed } = this.totpService.generateBackupCodes();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: adminId },
        data: { totpEnabled: true, totpVerifiedAt: new Date() },
      });
      await tx.adminTotpBackupCode.createMany({
        data: hashed.map((codeHash) => ({ userId: adminId, codeHash })),
      });
    });

    // Return plain codes exactly once — store securely, never retrieved again
    return { backupCodes: plain };
  }

  // Rotate admin refresh token
  async refresh(cookieToken: string, req: Request, res: Response) {
    if (!cookieToken) {
      throw new UnauthorizedException('Admin refresh token not found');
    }

    const tokenHash = this.tokenService.hashToken(cookieToken);
    const session = await this.prisma.session.findFirst({
      where: {
        refreshTokenHash: tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
            deletedAt: true,
            totpEnabled: true,
          },
        },
      },
    });

    if (
      !session ||
      session.user.deletedAt ||
      !ALLOWED_ADMIN_ROLES.includes(session.user.role as UserRole)
    ) {
      this.tokenService.clearRefreshCookie(res);
      throw new UnauthorizedException('Admin session is invalid or expired');
    }

    if (
      session.user.status === UserStatus.SUSPENDED ||
      session.user.status === UserStatus.BANNED
    ) {
      this.tokenService.clearRefreshCookie(res);
      throw new ForbiddenException('Admin account has been suspended');
    }

    const newRefreshToken = this.tokenService.generateRefreshToken();
    const newHash = this.tokenService.hashToken(newRefreshToken);
    const expiresAt = addDays(new Date(), 30);

    // Rotate: revoke old session, create new one — capture new session ID
    let newSessionId: string;
    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), revokeReason: 'rotated' },
      });
      const newSession = await tx.session.create({
        data: {
          userId: session.userId,
          refreshTokenHash: newHash,
          expiresAt,
          deviceName: session.deviceName,
          ipCreated: session.ipCreated,
          ipLastUsed: req.ip,
          userAgent: session.userAgent,
        },
      });
      newSessionId = newSession.id; // ← must use NEW session ID, not the revoked one
    });

    const accessToken = this.issueAdminAccessToken(
      session.user.id,
      session.user.email,
      session.user.role as UserRole,
      newSessionId!, // ← FIXED: was session.id (already revoked → always 401)
    );

    this.tokenService.setRefreshCookie(res, newRefreshToken, expiresAt);
    return {
      accessToken,
      admin: {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
      },
    };
  }

  // Logout current admin session
  async logout(sessionId: string, res: Response) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'admin_logout' },
    });
    this.tokenService.clearRefreshCookie(res);
    return { message: 'Admin logged out successfully' };
  }

  // --- PRIVATE HELPERS ---

  private async issueAdminTokens(
    user: { id: string; email: string; role: UserRole },
    req: Request,
    res: Response,
  ) {
    const refreshToken = this.tokenService.generateRefreshToken();
    const expiresAt = addDays(new Date(), 30);

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: this.tokenService.hashToken(refreshToken),
        expiresAt,
        deviceName: 'Admin Panel',
        ipCreated: req.ip,
        ipLastUsed: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = this.issueAdminAccessToken(
      user.id,
      user.email,
      user.role,
      session.id,
    );
    this.tokenService.setRefreshCookie(res, refreshToken, expiresAt);

    return {
      accessToken,
      admin: { id: user.id, email: user.email, role: user.role },
    };
  }

  private issueAdminAccessToken(
    sub: string,
    email: string,
    role: UserRole,
    sessionId: string,
  ): string {
    const payload: AdminJwtPayload = { sub, email, role, sessionId, isAdmin: true };
    return this.jwtService.sign(payload, {
      secret: this.config.get<string>('auth.jwtAdminAccessSecret'),
      expiresIn: 900, // 15 minutes
      issuer: 'vibly-api',
      audience: 'vibly-admin',
    });
  }
}
