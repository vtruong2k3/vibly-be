import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import { Response } from 'express';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  sessionId: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // Issue short-lived JWT Access Token (alg:HS256, signed with access secret)
  issueAccessToken(payload: AccessTokenPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('auth.jwtAccessSecret'),
      expiresIn: 900, // 15 minutes in seconds
      issuer: 'vibly-api',
      audience: 'vibly-client',
    });
  }

  // Generate cryptographically secure random refresh token
  generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  // Hash refresh token for DB storage — never store raw tokens
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // Set __Host-refresh cookie (OWASP: HttpOnly, Secure, SameSite=Lax, no Domain)
  setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
    const cookieName = this.config.get<string>('auth.refreshCookieName', '__Host-refresh');

    res.cookie(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
      // OWASP: No domain set with __Host- prefix to prevent subdomain leaks
    });
  }

  // Clear refresh token cookie on logout
  clearRefreshCookie(res: Response): void {
    const cookieName = this.config.get<string>('auth.refreshCookieName', '__Host-refresh');
    res.clearCookie(cookieName, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwt.verify(token, {
      secret: this.config.get<string>('auth.jwtAccessSecret'),
      issuer: 'vibly-api',
      audience: 'vibly-client',
    });
  }
}
