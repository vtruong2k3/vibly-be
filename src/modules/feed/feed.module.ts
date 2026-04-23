import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-yet';
import { FeedController } from './controllers/feed.controller';
import { FeedService } from './services/feed.service';
import { FeedFanOutProcessor } from './processors/feed-fan-out.processor';
import { FEED_QUEUE } from './feed.constants';

@Module({
  imports: [
    // Redis cache — 30s feed freshness window
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        store: await redisStore({
          url: config.get<string>('redis.url', 'redis://localhost:6379'),
          ttl: 30000,
        }),
      }),
    }),

    // BullMQ — fan-out on write queue backed by Redis
    BullModule.registerQueueAsync({
      name: FEED_QUEUE,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('redis.url', 'redis://localhost:6379'),
        },
      }),
    }),
  ],
  controllers: [FeedController],
  providers: [FeedService, FeedFanOutProcessor],
  exports: [FeedService],
})
export class FeedModule { }
