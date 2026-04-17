import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './controllers/auth.controller';
import { GoogleAuthController } from './controllers/google-auth.controller';
import { AuthService } from './services/auth.service';
import { GoogleAuthService } from './services/google-auth.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    MailModule,
  ],
  controllers: [AuthController, GoogleAuthController],
  providers: [AuthService, GoogleAuthService, PasswordService, TokenService, JwtStrategy, GoogleStrategy],
  exports: [PasswordService, TokenService, JwtStrategy],
})
export class AuthModule {}
