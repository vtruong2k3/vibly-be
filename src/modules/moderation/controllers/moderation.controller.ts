import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ModerationService } from '../services/moderation.service';
import { CreateReportDto } from '../dto/create-report.dto';
import { ModerationActionDto } from '../dto/moderation-action.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../../common/decorators/current-user.decorator';

@ApiTags('Moderation')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'moderation', version: '1' })
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  // POST /moderation/report — Available to all authenticated users (Plan: §Settings & Moderation)
  @Post('report')
  @ApiOperation({
    summary: 'File a report on a user, post, comment, or message',
  })
  createReport(@CurrentUser() user: JwtPayload, @Body() dto: CreateReportDto) {
    return this.moderationService.createReport(user.sub, dto);
  }

  // GET /moderation/reports — MODERATOR+ only
  @Get('reports')
  @UseGuards(RolesGuard)
  @Roles('MODERATOR', 'ADMIN')
  @ApiOperation({ summary: '[Moderator] List all reports' })
  getReports(
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.moderationService.getReports(status, cursor, limit);
  }

  // POST /moderation/action — MODERATOR+ only
  @Post('action')
  @UseGuards(RolesGuard)
  @Roles('MODERATOR', 'ADMIN')
  @ApiOperation({ summary: '[Moderator] Apply a moderation action' })
  takeAction(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ModerationActionDto,
  ) {
    return this.moderationService.takeAction(user.sub, dto);
  }
}
