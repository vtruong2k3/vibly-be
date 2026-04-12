import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class PresenceService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(private configService: ConfigService) {
    const redisUrl = this.configService.get<string>(
      'redis.url',
      'redis://localhost:6379',
    );
    this.redis = new Redis(redisUrl);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  async setOnline(userId: string, socketId: string) {
    // Add socketId to Set of sockets for this user
    await this.redis.sadd(`user:online:${userId}`, socketId);
    // Expire the key after 24h just in case there's a dangling socket leak
    await this.redis.expire(`user:online:${userId}`, 86400);
  }

  async setOffline(userId: string, socketId: string) {
    await this.redis.srem(`user:online:${userId}`, socketId);
    const remaining = await this.redis.scard(`user:online:${userId}`);
    // If no sockets left, remove the key completely
    if (remaining === 0) {
      await this.redis.del(`user:online:${userId}`);
    }
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const count = await this.redis.scard(`user:online:${userId}`);
    return count > 0;
  }

  async getOnlineStatuses(userIds: string[]): Promise<Record<string, boolean>> {
    const pipeline = this.redis.pipeline();
    for (const id of userIds) {
      pipeline.scard(`user:online:${id}`);
    }
    const results = await pipeline.exec();

    const statuses: Record<string, boolean> = {};
    if (results) {
      userIds.forEach((id, index) => {
        const [err, count] = results[index] as [Error | null, unknown];
        statuses[id] = !err && typeof count === 'number' && count > 0;
      });
    }
    return statuses;
  }
}
