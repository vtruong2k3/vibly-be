import { registerAs } from '@nestjs/config';

export const authConfig = registerAs('auth', () => ({
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  // Access token: 15 minutes (OWASP short-lived JWT)
  jwtAccessExpiry: '15m',
  // Refresh token: 30 days
  jwtRefreshExpiry: '30d',
  // Cookie name: __Host- prefix prevents subdomain attacks (OWASP)
  refreshCookieName: '__Host-refresh',
  argon2MemoryCost: 65536, // 64MB
  argon2TimeCost: 3,
  argon2Parallelism: 4,
  // Google OAuth2
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL,
  frontendOAuthSuccessUrl: process.env.FRONTEND_OAUTH_SUCCESS_URL ?? 'http://localhost:3000/auth/callback',
}));
