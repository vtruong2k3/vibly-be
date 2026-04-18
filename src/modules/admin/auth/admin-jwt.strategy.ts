import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma/prisma.service';

// Admin JWT payload — separate interface from user JwtPayload
export interface AdminJwtPayload {
  sub: string;
  email: string;
  role: string; // 'ADMIN' | 'MODERATOR'
  sessionId: string;
  isAdmin: true; // type discriminant: reject user tokens in admin guard
}

// Named strategy 'admin-jwt' — entirely separate from the user 'jwt' strategy
@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        config.get<string>('auth.jwtAdminAccessSecret') ?? 'fallback-admin-secret-change-me',
      issuer: 'vibly-api',
      audience: 'vibly-admin',
    });
  }

  // CRITICAL: verify session still active — closes the 15-min revocation gap
  async validate(payload: AdminJwtPayload): Promise<AdminJwtPayload> {
    if (!payload.isAdmin) {
      throw new UnauthorizedException('Not an admin token');
    }

    const session = await this.prisma.session.findFirst({
      where: { id: payload.sessionId, revokedAt: null },
      select: { id: true },
    });

    if (!session) {
      throw new UnauthorizedException('Admin session has been revoked');
    }

    return payload;
  }
}
