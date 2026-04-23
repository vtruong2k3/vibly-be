import {
  Controller,
  Get,
  Req,
  Res,
  UseGuards,
  Query,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthService } from '../services/google-auth.service';
import { Public } from '../../../common/decorators/public.decorator';
import { createHmac, randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import type { GoogleProfile } from '../strategies/google.strategy';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class GoogleAuthController {
  constructor(
    private readonly googleAuthService: GoogleAuthService,
    private readonly config: ConfigService,
  ) { }

  /**
   * GET /api/v1/auth/google
   * Generates a signed CSRF state token (HMAC-SHA256), stores it in a
   * short-lived HttpOnly cookie, then redirects to Google OAuth2 consent screen.
   */
  @Public()
  @Get('google')
  @HttpCode(HttpStatus.FOUND)
  @ApiOperation({ summary: 'Redirect to Google OAuth2 consent screen' })
  googleAuth(@Res() res: Response): void {
    const stateRaw = randomBytes(16).toString('hex');
    const stateHmac = this.signState(stateRaw);
    const stateParam = `${stateRaw}.${stateHmac}`;

    // Store state in a short-lived HttpOnly cookie for verification on callback
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('oauth_state', stateParam, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/api/v1/auth/google',
      maxAge: 5 * 60 * 1000, // 5 minutes
    });

    const clientId = this.config.get<string>('auth.googleClientId') ?? '';
    const callbackUrl = encodeURIComponent(
      this.config.get<string>('auth.googleCallbackUrl') ?? '',
    );
    const scope = encodeURIComponent('email profile');

    const googleUrl =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${clientId}` +
      `&redirect_uri=${callbackUrl}` +
      `&response_type=code` +
      `&scope=${scope}` +
      `&state=${encodeURIComponent(stateParam)}` +
      `&access_type=offline` +
      `&prompt=select_account`;

    res.redirect(googleUrl);
  }

  /**
   * GET /api/v1/auth/google/callback
   * Google redirects here. Verifies CSRF state, then processes authentication.
   * Sets HttpOnly refresh cookie and redirects to frontend with ?auth=success.
   * Access token is placed in a scoped, short-lived readable cookie (NOT in URL).
   */
  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiExcludeEndpoint()
  async googleCallback(
    @Query('state') stateParam: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const successUrl =
      this.config.get<string>('auth.frontendOAuthSuccessUrl') ??
      'http://localhost:3000/auth/callback';

    try {
      // CSRF state verification
      const cookieState = (req.cookies as Record<string, string>)?.['oauth_state'];
      if (!cookieState || cookieState !== stateParam) {
        throw new UnauthorizedException('Invalid OAuth state — possible CSRF attack.');
      }

      const [raw, hmac] = stateParam.split('.');
      if (!raw || !hmac || this.signState(raw) !== hmac) {
        throw new UnauthorizedException('OAuth state signature invalid.');
      }

      // Clear the state cookie — single use
      const isProduction = process.env.NODE_ENV === 'production';
      res.clearCookie('oauth_state', { path: '/api/v1/auth/google' });

      const profile = req.user as GoogleProfile;

      // validateAndLogin sets the __Host-refresh HttpOnly cookie on `res`
      const { accessToken } = await this.googleAuthService.validateAndLogin(
        profile,
        req,
        res,
      );

      // For cross-domain OAuth (Koyeb BE -> Vercel FE), cookies with SameSite/Domain issues fail to be read by frontend.
      // So we pass the access token in the query params. The frontend will consume it and replace the router strictly.
      res.redirect(`${successUrl}?auth=success&token=${accessToken}`);
    } catch (err: unknown) {
      const reason =
        err instanceof Error
          ? encodeURIComponent(err.message)
          : 'oauth_error';
      res.redirect(`${successUrl}?auth=error&reason=${reason}`);
    }
  }

  private signState(raw: string): string {
    const secret =
      this.config.get<string>('auth.jwtAccessSecret') ?? 'fallback';
    return createHmac('sha256', secret).update(raw).digest('hex');
  }
}
