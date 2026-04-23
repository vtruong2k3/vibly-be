import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';

// Auth
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminJwtStrategy } from './auth/admin-jwt.strategy';
import { TotpService } from './auth/totp.service';

// Users
import { AdminUsersController } from './users/admin-users.controller';
import { AdminUsersService } from './users/admin-users.service';

// Accounts (Admin team management — P1)
import { AdminAccountsController } from './accounts/admin-accounts.controller';
import { AdminAccountsService } from './accounts/admin-accounts.service';

// Content
import { AdminContentController } from './content/admin-content.controller';
import { AdminContentService } from './content/admin-content.service';

// Reports
import { AdminReportsController } from './reports/admin-reports.controller';
import { AdminReportsService } from './reports/admin-reports.service';

// Analytics
import { AdminAnalyticsController } from './analytics/admin-analytics.controller';
import { AdminAnalyticsService } from './analytics/admin-analytics.service';

// Audit Log
import { AdminAuditController } from './audit-log/admin-audit.controller';
import { AdminAuditService } from './audit-log/admin-audit.service';

// Media
import { MediaQuarantineService } from './media/media-quarantine.service';

// Revoker
import { RevokerService } from './revoker/revoker.service';

// Moderation Settings
import { AdminModerationController } from './moderation/admin-moderation.controller';
import { AdminModerationService } from './moderation/admin-moderation.service';

// System Settings
import { AdminSettingsController } from './settings/admin-settings.controller';
import { AdminSettingsService } from './settings/admin-settings.service';

// Gateways
import { AdminGateway } from './admin.gateway';

// External modules
import { AuthModule } from '../auth/auth.module';
import { PresenceModule } from '../presence/presence.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [
    PassportModule,                    // Required for Passport strategies
    JwtModule.register({}),            // Secrets injected at runtime per-sign
    ScheduleModule.forRoot(),          // Enables @Cron for media purge CronJob
    CacheModule.register(),            // Inject Memory Cache for CACHE_MANAGER
    AuthModule,                        // Re-use PasswordService + TokenService
    forwardRef(() => ModerationModule),// Import AutoModerationService for Keyword CRUD
    forwardRef(() => PresenceModule),  // Revoker → PresenceGateway (breaks circular dep)
  ],
  controllers: [
    AdminAuthController,
    AdminUsersController,
    AdminAccountsController,
    AdminContentController,
    AdminReportsController,
    AdminAnalyticsController,
    AdminAuditController,
    AdminModerationController,
    AdminSettingsController,
  ],
  providers: [
    // Passport
    AdminJwtStrategy,
    // Services
    TotpService,
    AdminAuthService,
    AdminUsersService,
    AdminAccountsService,
    AdminContentService,
    AdminReportsService,
    AdminAnalyticsService,
    AdminAuditService,
    MediaQuarantineService,
    RevokerService,
    AdminModerationService,
    AdminSettingsService,
    AdminGateway,
  ],
  exports: [
    AdminAuditService, // Allow other modules to write audit logs
    RevokerService,    // Allow other modules to revoke sessions
    AdminGateway,      // Allow other modules to emit to admin_room
  ],
})
export class AdminModule { }
