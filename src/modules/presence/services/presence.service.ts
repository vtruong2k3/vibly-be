import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

export interface UserPresenceData {
  isOnline: boolean;
  lastSeenAt: string | null;
}

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

  async setOffline(userId: string, socketId: string): Promise<boolean> {
    await this.redis.srem(`user:online:${userId}`, socketId);
    const remaining = await this.redis.scard(`user:online:${userId}`);

    if (remaining === 0) {
      // Last socket disconnected — record lastSeenAt and remove online key
      const now = new Date().toISOString();
      await this.redis.set(`user:lastSeen:${userId}`, now, 'EX', 604800); // 7 days TTL
      await this.redis.del(`user:online:${userId}`);
      return true; // truly offline now
    }
    return false; // still has other tabs open
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const count = await this.redis.scard(`user:online:${userId}`);
    return count > 0;
  }

  async getLastSeen(userId: string): Promise<string | null> {
    return this.redis.get(`user:lastSeen:${userId}`);
  }

  async getPresence(userId: string): Promise<UserPresenceData> {
    const isOnline = await this.isUserOnline(userId);
    const lastSeenAt = isOnline ? null : await this.getLastSeen(userId);
    return { isOnline, lastSeenAt };
  }

  async getPresenceBulk(
    userIds: string[],
  ): Promise<Record<string, UserPresenceData>> {
    if (userIds.length === 0) return {};

    const pipeline = this.redis.pipeline();
    for (const id of userIds) {
      pipeline.scard(`user:online:${id}`);
    }
    const onlineResults = await pipeline.exec();

    // Second pipeline for lastSeenAt of offline users
    const offlineIds: string[] = [];
    const onlineMap: Record<string, boolean> = {};

    if (onlineResults) {
      userIds.forEach((id, index) => {
        const [err, count] = onlineResults[index] as [Error | null, number];
        const isOnline = !err && count > 0;
        onlineMap[id] = isOnline;
        if (!isOnline) offlineIds.push(id);
      });
    }

    // Batch-fetch lastSeenAt for offline users
    const lastSeenMap: Record<string, string | null> = {};
    if (offlineIds.length > 0) {
      const pipeline2 = this.redis.pipeline();
      for (const id of offlineIds) {
        pipeline2.get(`user:lastSeen:${id}`);
      }
      const lastSeenResults = await pipeline2.exec();
      if (lastSeenResults) {
        offlineIds.forEach((id, index) => {
          const [err, val] = lastSeenResults[index] as [Error | null, string | null];
          lastSeenMap[id] = err ? null : val;
        });
      }
    }

    const result: Record<string, UserPresenceData> = {};
    for (const id of userIds) {
      result[id] = {
        isOnline: onlineMap[id] ?? false,
        lastSeenAt: onlineMap[id] ? null : (lastSeenMap[id] ?? null),
      };
    }
    return result;
  }
}
