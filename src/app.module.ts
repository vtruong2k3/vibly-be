import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { appConfig } from './config/app.config';
import { authConfig } from './config/auth.config';
import { databaseConfig } from './config/database.config';
import { redisConfig } from './config/redis.config';
import { s3Config } from './config/s3.config';
import { livekitConfig } from './config/livekit.config';
import { PrismaModule } from './database/prisma/prisma.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// ── Phase 1 ───────────────────────────────────────
import { AuthModule } from './modules/auth/auth.module';

// ── Phase 2 ───────────────────────────────────────
import { UsersModule } from './modules/users/users.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { FriendshipsModule } from './modules/friendships/friendships.module';
import { PostsModule } from './modules/posts/posts.module';
import { FeedModule } from './modules/feed/feed.module';
import { MediaModule } from './modules/media/media.module';
import { SettingsModule } from './modules/settings/settings.module';

// ── Phase 6 ───────────────────────────────────────
import { PresenceModule } from './modules/presence/presence.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MessagesModule } from './modules/messages/messages.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

// ── Phase 7 ───────────────────────────────────────
import { CallsModule } from './modules/calls/calls.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    // Config: load all namespaced configs, validate env at startup
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, authConfig, databaseConfig, redisConfig, s3Config, livekitConfig],
      cache: true,
    }),

    // Rate limiting: global (per-route overrides in controllers)
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 1 minute
        limit: 100,
      },
    ]),

    // Database (Global — PrismaService available in all modules)
    PrismaModule,

    // ── Phase 1 ────────
    AuthModule,

    // ── Phase 2 ────────
    ProfilesModule,   // Must be before UsersModule (UsersModule imports ProfilesModule)
    UsersModule,
    FriendshipsModule,
    PostsModule,
    FeedModule,
    MediaModule,
    SettingsModule,

    // ── Phase 6 ────────
    PresenceModule,
    ConversationsModule,
    MessagesModule,
    NotificationsModule,

    // ── Phase 7 ────────
    CallsModule,
    ModerationModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
