import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminAnalyticsService } from './admin-analytics.service';
import { UserRole } from '@prisma/client';

@ApiTags('Admin Analytics')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MODERATOR)
@Controller({ path: 'admin/analytics', version: '1' })
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AdminAnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: '[Admin] Dashboard KPIs — users, content, reports counts + deltas' })
  getOverview() {
    return this.analyticsService.getOverview();
  }

  @Get('registrations')
  @ApiQuery({ name: 'days', required: false, type: Number, example: 30 })
  @ApiOperation({ summary: '[Admin] Daily registration trend (last N days)' })
  getRegistrationTrend(@Query('days') days?: string) {
    return this.analyticsService.getRegistrationTrend(
      days ? parseInt(days, 10) : 30,
    );
  }

  @Get('content')
  @ApiQuery({ name: 'days', required: false, type: Number, example: 30 })
  @ApiOperation({ summary: '[Admin] Daily posts + comments trend (last N days)' })
  getContentTrend(@Query('days') days?: string) {
    return this.analyticsService.getContentTrend(
      days ? parseInt(days, 10) : 30,
    );
  }

  @Get('reports/breakdown')
  @ApiOperation({ summary: '[Admin] Report breakdown by reason code and status' })
  getReportBreakdown() {
    return this.analyticsService.getReportBreakdown();
  }
}
