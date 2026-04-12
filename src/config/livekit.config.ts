import { registerAs } from '@nestjs/config';

export const livekitConfig = registerAs('livekit', () => ({
  apiKey: process.env.LIVEKIT_API_KEY,
  apiSecret: process.env.LIVEKIT_API_SECRET,
  host: process.env.LIVEKIT_HOST ?? 'wss://localhost:7443',
  // Token TTL for participants (seconds)
  tokenTtl: 3600,
}));
