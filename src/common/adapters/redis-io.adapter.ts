import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(private app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const configService = this.app.get(ConfigService);
    const redisUrl = configService.get<string>('redis.url', 'redis://localhost:6379');

    const pubClient = new Redis(redisUrl);
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect().catch(() => {}), subClient.connect().catch(() => {})]);

    // Handle Redis connection errors gracefully in logs
    pubClient.on('error', (err) => console.error('Redis PubClient Error', err));
    subClient.on('error', (err) => console.error('Redis SubClient Error', err));

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: true, // Let NestJS handle specific CORS config if needed or allow all for WS
        credentials: true,
      },
    });
    server.adapter(this.adapterConstructor);
    return server;
  }
}
