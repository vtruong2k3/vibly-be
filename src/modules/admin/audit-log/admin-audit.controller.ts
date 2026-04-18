import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminAuditService } from './admin-audit.service';
import { UserRole } from '@prisma/client';

@ApiTags('Admin Audit Logs')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(UserRole.ADMIN) // Audit logs are ADMIN-only — do not expose to MODERATOR
@Controller({ path: 'admin/audit-logs', version: '1' })
export class AdminAuditController {
  constructor(private readonly auditService: AdminAuditService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Get audit logs — ADMIN only' })
  @ApiQuery({ name: 'actorId',    required: false, type: String })
  @ApiQuery({ name: 'action',     required: false, type: String })
  @ApiQuery({ name: 'entityType', required: false, type: String })
  @ApiQuery({ name: 'entityId',   required: false, type: String })
  @ApiQuery({ name: 'dateFrom',   required: false, type: String })
  @ApiQuery({ name: 'dateTo',     required: false, type: String })
  @ApiQuery({ name: 'cursor',     required: false, type: String })
  @ApiQuery({ name: 'limit',      required: false, type: Number })
  getLogs(
    @Query('actorId')    actorId?: string,
    @Query('action')     action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId')   entityId?: string,
    @Query('dateFrom')   dateFrom?: string,
    @Query('dateTo')     dateTo?: string,
    @Query('cursor')     cursor?: string,
    @Query('limit')      limit?: string,
  ) {
    return this.auditService.getLogs({
      actorId,
      action,
      entityType,
      entityId,
      dateFrom:  dateFrom  ? new Date(dateFrom)  : undefined,
      dateTo:    dateTo    ? new Date(dateTo)    : undefined,
      cursor,
      limit:     limit     ? parseInt(limit, 10) : undefined,
    });
  }
}
