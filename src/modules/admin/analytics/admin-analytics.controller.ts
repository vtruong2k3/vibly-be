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
  constructor(private readonly analyticsService: AdminAnalyticsService) { }

  @Get('overview')
  @ApiQuery({ name: 'from', required: false, type: String, example: '2026-04-01T00:00:00Z' })
  @ApiQuery({ name: 'to', required: false, type: String, example: '2026-04-15T23:59:59Z' })
  @ApiOperation({ summary: '[Admin] Dashboard KPIs — users, content, reports counts + deltas' })
  getOverview(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getOverview(from, to);
  }

  @Get('registrations')
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiOperation({ summary: '[Admin] Daily registration trend (date range)' })
  getRegistrationTrend(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getRegistrationTrend(from, to);
  }

  @Get('content')
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiOperation({ summary: '[Admin] Daily posts + comments trend (date range)' })
  getContentTrend(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getContentTrend(from, to);
  }

  @Get('reports/breakdown')
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiOperation({ summary: '[Admin] Report breakdown by reason code and status' })
  getReportBreakdown(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getReportBreakdown(from, to);
  }

  @Get('platforms')
  @ApiOperation({ summary: '[Admin] Platform Distribution (Mocked)' })
  getPlatforms() {
    return this.analyticsService.getPlatformDistribution();
  }

  @Get('moderation-resolution')
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiOperation({ summary: '[Admin] Moderation resolution trend by day' })
  getModerationResolution(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getModerationResolution(from, to);
  }

  @Get('activity-heatmap')
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiOperation({ summary: '[Admin] User activity heatmap by Day of Week and Hour' })
  getActivityHeatmap(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getActivityHeatmap(from, to);
  }

  @Get('post-categories')
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiOperation({ summary: '[Admin] Post categories percentage split' })
  getPostCategories(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getPostCategories(from, to);
  }

  @Get('moderation-queue')
  @ApiOperation({ summary: '[Admin] Top 5 urgent open reports preview' })
  getModerationQueue() {
    return this.analyticsService.getModerationQueue();
  }

  @Get('system-status')
  @ApiOperation({ summary: '[Admin] Systems and Services Health Check' })
  getSystemStatus() {
    return this.analyticsService.getSystemStatus();
  }
}
