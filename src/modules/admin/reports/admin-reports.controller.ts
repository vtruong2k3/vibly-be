import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AdminJwtPayload } from '../auth/admin-jwt.strategy';
import { AdminReportsService } from './admin-reports.service';
import { UserRole } from '@prisma/client';

@ApiTags('Admin Reports')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MODERATOR)
@Controller({ path: 'admin/reports', version: '1' })
export class AdminReportsController {
  constructor(private readonly reportsService: AdminReportsService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] List reports — sorted CRITICAL first' })
  getReports(
    @CurrentUser() admin: AdminJwtPayload,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('targetType') targetType?: string,
    @Query('moderatorId') moderatorId?: string,
    @Query('assignedToMe') assignedToMe?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.getReports({
      status,
      severity,
      targetType,
      moderatorId,
      assignedToMe: assignedToMe === 'true',
      actorId: admin.sub,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: '[Admin] Get report detail with moderation history' })
  getReportDetail(@Param('id') id: string) {
    return this.reportsService.getReportDetail(id);
  }

  @Patch(':id/reviewing')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Claim report for review' })
  markReviewing(
    @CurrentUser() admin: AdminJwtPayload,
    @Param('id') reportId: string,
    @Req() req: any,
  ) {
    return this.reportsService.markReviewing(admin.sub, reportId, req.ip);
  }

  @Patch(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Resolve report with a note' })
  @ApiBody({ schema: { type: 'object', properties: { resolveNote: { type: 'string' } }, required: ['resolveNote'] } })
  resolve(
    @CurrentUser() admin: AdminJwtPayload,
    @Param('id') reportId: string,
    @Body('resolveNote') resolveNote: string,
    @Req() req: any,
  ) {
    return this.reportsService.resolve(admin.sub, reportId, resolveNote, req.ip);
  }

  @Patch(':id/dismiss')
  @Roles(UserRole.ADMIN) // Fine-grained override
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Dismiss report — ADMIN only' })
  @ApiBody({ schema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] } })
  dismiss(
    @CurrentUser() admin: AdminJwtPayload,
    @Param('id') reportId: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    return this.reportsService.dismiss(
      admin.sub,
      admin.role,
      reportId,
      reason,
      req.ip,
    );
  }

  @Patch(':id/escalate')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Escalate report severity — ADMIN only' })
  @ApiBody({ schema: { type: 'object', properties: { severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] } }, required: ['severity'] } })
  escalate(
    @CurrentUser() admin: AdminJwtPayload,
    @Param('id') reportId: string,
    @Body('severity') severity: string,
    @Req() req: any,
  ) {
    return this.reportsService.escalate(
      admin.sub,
      admin.role,
      reportId,
      severity,
      req.ip,
    );
  }
}
