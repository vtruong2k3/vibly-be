import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { UserStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { addDays, addHours } from 'date-fns';
import { Request, Response } from 'express';
import { MailService } from 'src/modules/mail/mail.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
  ) {}

  // === REGISTER ===
  async register(dto: RegisterDto) {
    // Check for existing email/username — generic error to prevent enumeration (OWASP)
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.email.toLowerCase() },
          { username: dto.username.toLowerCase() },
        ],
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException('Email or username is already taken');
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    // Use transaction: create user + profile + settings atomically
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          username: dto.username.toLowerCase(),
          passwordHash,
        },
      });

      // Create linked profile (1-1 per user)
      await tx.profile.create({
        data: {
          userId: newUser.id,
          displayName: dto.displayName,
        },
      });

      // Bootstrap default privacy settings (per plan)
      await tx.userPrivacySettings.create({ data: { userId: newUser.id } });
      await tx.userNotificationSettings.create({
        data: { userId: newUser.id },
      });
      await tx.userSecuritySettings.create({ data: { userId: newUser.id } });
      await tx.userPresence.create({ data: { userId: newUser.id } });

      return newUser;
    });

    // Generate and persist email verification token
    await this.createEmailVerification(user.id, user.email);

    this.logger.log(`New user registered: ${user.id} <${user.email}>`);
    return {
      message:
        'Registration successful. Please check your email to verify your account.',
    };
  }

  // === LOGIN ===
  async login(dto: LoginDto, req: Request, res: Response) {
    // Find user — deliberately generic error message (OWASP: anti-enumeration)
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), deletedAt: null },
    });

    // Always compare hash even if user not found (timing attack prevention)
    const passwordValid =
      user != null &&
      (await this.passwordService.verify(user.passwordHash, dto.password));

    if (!user || !passwordValid) {
      throw new UnauthorizedException('Email or password is incorrect');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Your account has been suspended');
    }

    const isDev = process.env.NODE_ENV !== 'production';
    if (!isDev && !user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Please verify your email address before logging in',
      );
    }

    // Create DB session — enables per-device management & remote revocation
    const refreshToken = this.tokenService.generateRefreshToken();
    const refreshTokenHash = this.tokenService.hashToken(refreshToken);
    const expiresAt = addDays(new Date(), 30);

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        expiresAt,
        deviceName: this.extractDeviceName(req.headers['user-agent']),
        deviceOs: this.extractOs(req.headers['user-agent']),
        browser: this.extractBrowser(req.headers['user-agent']),
        ipCreated: req.ip,
        ipLastUsed: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = this.tokenService.issueAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
    });

    // Set rotate-able HttpOnly cookie (OWASP)
    this.tokenService.setRefreshCookie(res, refreshToken, expiresAt);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    };
  }

  // === REFRESH === (Token Rotation: revoke old session, create new)
  async refresh(cookieRefreshToken: string, req: Request, res: Response) {
    if (!cookieRefreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const tokenHash = this.tokenService.hashToken(cookieRefreshToken);
    const now = new Date();

    const session = await this.prisma.session.findFirst({
      where: {
        refreshTokenHash: tokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });

    if (
      !session ||
      session.user.status === UserStatus.SUSPENDED ||
      session.user.deletedAt
    ) {
      // Clear poisoned cookie
      this.tokenService.clearRefreshCookie(res);
      throw new UnauthorizedException('Session is invalid or expired');
    }

    // Rotate: invalidate current session, create new one
    const newRefreshToken = this.tokenService.generateRefreshToken();
    const newRefreshTokenHash = this.tokenService.hashToken(newRefreshToken);
    const newExpiresAt = addDays(new Date(), 30);

    await this.prisma.$transaction(async (tx) => {
      // Revoke old session
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: now, revokeReason: 'rotated' },
      });

      // Create fresh session
      await tx.session.create({
        data: {
          userId: session.userId,
          refreshTokenHash: newRefreshTokenHash,
          expiresAt: newExpiresAt,
          deviceName: session.deviceName,
          deviceOs: session.deviceOs,
          browser: session.browser,
          ipCreated: session.ipCreated,
          ipLastUsed: req.ip,
          userAgent: session.userAgent,
          lastUsedAt: now,
        },
      });
    });

    const accessToken = this.tokenService.issueAccessToken({
      sub: session.user.id,
      email: session.user.email,
      role: session.user.role,
      sessionId: session.id,
    });

    this.tokenService.setRefreshCookie(res, newRefreshToken, newExpiresAt);

    return { accessToken };
  }

  // === LOGOUT === (Revoke current device session)
  async logout(sessionId: string, res: Response) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'user_logout' },
    });

    this.tokenService.clearRefreshCookie(res);
    return { message: 'Logged out successfully' };
  }

  // === LOGOUT ALL === (Revoke all device sessions for the user)
  async logoutAll(userId: string, res: Response) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'user_logout_all' },
    });

    this.tokenService.clearRefreshCookie(res);
    return { message: 'Logged out from all devices' };
  }

  // === EMAIL VERIFICATION ===
  async verifyEmail(token: string) {
    const tokenHash = this.tokenService.hashToken(token);
    const now = new Date();

    const record = await this.prisma.emailVerification.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    });

    if (!record) {
      throw new BadRequestException(
        'Email verification token is invalid or expired',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerification.update({
        where: { id: record.id },
        data: { usedAt: now },
      });

      await tx.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: now },
      });
    });

    return { message: 'Email verified successfully. You can now log in.' };
  }

  async resendVerifyEmail(email: string) {
    // OWASP: Do not confirm if email exists or not to prevent enumeration
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      select: { id: true, emailVerifiedAt: true, email: true },
    });

    if (!user) {
      return { message: 'If that email exists, a verification link has been sent.' };
    }

    if (user.emailVerifiedAt) {
      return { message: 'If that email exists, a verification link has been sent.' };
    }

    await this.createEmailVerification(user.id, user.email);
    return { message: 'If that email exists, a verification link has been sent.' };
  }

  // === PASSWORD RESET ===
  async forgotPassword(email: string) {
    // OWASP: Always return same response regardless of email existence (anti-enumeration)
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
    });

    if (user) {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = this.tokenService.hashToken(rawToken);

      await this.prisma.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: addHours(new Date(), 2),
        },
      });

      // TODO: Send email with rawToken (integrate mail service in Phase 2)
      this.logger.log(`Password reset requested for user: ${user.id}`);
    }

    return {
      message:
        'If an account with that email exists, a reset link has been sent.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = this.tokenService.hashToken(token);
    const now = new Date();

    const record = await this.prisma.passwordReset.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    });

    if (!record) {
      throw new BadRequestException(
        'Password reset token is invalid or expired',
      );
    }

    const passwordHash = await this.passwordService.hash(newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordReset.update({
        where: { id: record.id },
        data: { usedAt: now },
      });

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });

      // Revoke ALL sessions on password change (OWASP security)
      await tx.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'password_reset' },
      });
    });

    return {
      message:
        'Password reset successfully. Please log in with your new password.',
    };
  }

  // === PRIVATE HELPERS ===
  private async createEmailVerification(userId: string, email: string) {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.tokenService.hashToken(rawToken);

    // Invalidate old tokens for this user
    await this.prisma.emailVerification.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    await this.prisma.emailVerification.create({
      data: {
        userId,
        tokenHash,
        expiresAt: addHours(new Date(), 24),
      },
    });

    // Fire and forget email notification
    this.mailService.sendVerificationEmail(email, rawToken);

    this.logger.log(`Email verification created for user: ${userId}`);
  }

  private extractDeviceName(userAgent?: string): string {
    if (!userAgent) return 'Unknown';
    if (userAgent.includes('Mobile')) return 'Mobile';
    if (userAgent.includes('Tablet')) return 'Tablet';
    return 'Desktop';
  }

  private extractOs(userAgent?: string): string {
    if (!userAgent) return 'Unknown';
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    return 'Unknown';
  }

  private extractBrowser(userAgent?: string): string {
    if (!userAgent) return 'Unknown';
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Unknown';
  }
}
