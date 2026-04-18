import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';

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

// External modules
import { AuthModule } from '../auth/auth.module';
import { PresenceModule } from '../presence/presence.module';

@Module({
  imports: [
    PassportModule,                    // Required for Passport strategies
    JwtModule.register({}),            // Secrets injected at runtime per-sign
    ScheduleModule.forRoot(),          // Enables @Cron for media purge CronJob
    AuthModule,                        // Re-use PasswordService + TokenService
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
  ],
  exports: [
    AdminAuditService, // Allow other modules to write audit logs
    RevokerService,    // Allow other modules to revoke sessions
  ],
})
export class AdminModule {}
