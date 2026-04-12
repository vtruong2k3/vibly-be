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
  argon2MemoryCost: 65536,   // 64MB
  argon2TimeCost: 3,
  argon2Parallelism: 4,
}));
