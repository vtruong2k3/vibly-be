import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '8000', 10),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3001').split(','),
}));
