import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { TokenService } from './token.service';
import { AuthProvider } from '@prisma/client';
import { addDays } from 'date-fns';
import { Request, Response } from 'express';
import type { GoogleProfile } from '../strategies/google.strategy';

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Core logic: find-or-create user from Google profile, then issue a session.
   * Policy (chống account takeover):
   *  1. email_verified must be true — reject unverified Google emails.
   *  2. If email exists as LOCAL account → reject, ask user to login with password.
   *  3. If email exists as GOOGLE account → login normally (link by googleId).
   *  4. No existing account → create new GOOGLE account (no passwordHash).
   */
  async validateAndLogin(
    profile: GoogleProfile,
    req: Request,
    res: Response,
  ): Promise<{ accessToken: string }> {
    // Guard: require verified email from Google
    if (!profile.emailVerified) {
      throw new UnauthorizedException(
        'Google account email is not verified. Please verify your Google email first.',
      );
    }

    const email = profile.email.toLowerCase();

    // Try to find existing user by googleId first (most efficient path)
    let user = await this.prisma.user.findFirst({
      where: { googleId: profile.googleId, deletedAt: null },
    });

    if (!user) {
      // Check by email
      const existingByEmail = await this.prisma.user.findFirst({
        where: { email, deletedAt: null },
      });

      if (existingByEmail) {
        if (existingByEmail.authProvider === AuthProvider.LOCAL) {
          // Account Takeover Prevention: don't auto-link different providers
          throw new ConflictException(
            'An account with this email already exists. Please log in with your email and password.',
          );
        }

        // Same email, same GOOGLE provider — link googleId if missing
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: { googleId: profile.googleId },
        });
      } else {
        // New user: generate a unique, collision-safe username from email prefix
        const username = await this.generateUniqueUsername(email);

        user = await this.prisma.$transaction(async (tx) => {
          const newUser = await tx.user.create({
            data: {
              email,
              username,
              authProvider: AuthProvider.GOOGLE,
              googleId: profile.googleId,
              // emailVerifiedAt: set immediately since Google verified the email
              emailVerifiedAt: new Date(),
            },
          });

          await tx.profile.create({
            data: {
              userId: newUser.id,
              displayName: profile.displayName || username,
              // avatarMedia: handled separately if needed (would require media upload flow)
            },
          });

          await tx.userPrivacySettings.create({ data: { userId: newUser.id } });
          await tx.userNotificationSettings.create({ data: { userId: newUser.id } });
          await tx.userSecuritySettings.create({ data: { userId: newUser.id } });
          await tx.userPresence.create({ data: { userId: newUser.id } });

          return newUser;
        });

        this.logger.log(
          `New Google user registered: ${user.id} <${user.email}>`,
        );
      }
    }

    // Account status guard
    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Your account has been suspended.');
    }

    // Create session (same flow as /auth/login)
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

    // Set HttpOnly refresh cookie — identical security config to /auth/login
    this.tokenService.setRefreshCookie(res, refreshToken, expiresAt);

    this.logger.log(`Google login successful: ${user.id} <${user.email}>`);

    return { accessToken };
  }

  // Generate a username from the email prefix, appending random suffix for uniqueness
  private async generateUniqueUsername(email: string): Promise<string> {
    const base = email.split('@')[0].replace(/[^a-z0-9_]/gi, '').toLowerCase();
    const candidate = base.slice(0, 20);

    const existing = await this.prisma.user.findFirst({
      where: { username: candidate, deletedAt: null },
    });

    if (!existing) return candidate;

    // Append random 4-digit suffix to guarantee uniqueness
    const suffix = Math.floor(1000 + Math.random() * 9000).toString();
    return `${candidate.slice(0, 16)}${suffix}`;
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
