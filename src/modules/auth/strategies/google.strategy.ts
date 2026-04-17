import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly config: ConfigService) {
    super({
      clientID: config.get<string>('auth.googleClientId') ?? '',
      clientSecret: config.get<string>('auth.googleClientSecret') ?? '',
      callbackURL: config.get<string>('auth.googleCallbackUrl') ?? '',
      scope: ['email', 'profile'],
      // state: false — we manage CSRF protection manually via a signed state token
      // in the controller (avoids requiring express-session middleware)
      state: false,
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: {
      id: string;
      emails?: Array<{ value: string; verified: boolean }>;
      displayName: string;
      photos?: Array<{ value: string }>;
    },
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value ?? null;
    const emailVerified = profile.emails?.[0]?.verified ?? false;

    if (!email) {
      return done(new Error('No email returned from Google'), undefined);
    }

    const googleProfile: GoogleProfile = {
      googleId: profile.id,
      email,
      emailVerified,
      displayName: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    };

    done(null, googleProfile);
  }
}
