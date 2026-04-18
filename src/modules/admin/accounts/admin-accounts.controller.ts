import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiBody } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AdminJwtPayload } from '../auth/admin-jwt.strategy';
import { AdminAccountsService } from './admin-accounts.service';
import { UserRole, UserStatus } from '@prisma/client';

@ApiTags('Admin Accounts')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(UserRole.ADMIN) // Entire controller ADMIN-only per plan section 6.3
@Controller({ path: 'admin/accounts', version: '1' })
export class AdminAccountsController {
  constructor(private readonly accountsService: AdminAccountsService) {}

  @Get()
  @ApiOperation({
    summary: '[Admin] List all admin and moderator accounts — ADMIN only',
  })
  @ApiQuery({ name: 'role', enum: UserRole, required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getAccounts(
    @Query('role') role?: UserRole,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.accountsService.getAccounts({
      role,
      search,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: '[Admin] Get admin team stats (totals, TOTP coverage)' })
  getStats() {
    return this.accountsService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: '[Admin] Get admin/mod account detail + recent audit actions' })
  getAccountDetail(@Param('id') id: string) {
    return this.accountsService.getAccountDetail(id);
  }

  @Patch(':id/role')
  @ApiOperation({
    summary: '[Admin] Change mod role — MOD↔USER only, no ADMIN promotion via API',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { role: { type: 'string', enum: Object.values(UserRole) } },
      required: ['role'],
    },
  })
  updateRole(
    @CurrentUser() admin: AdminJwtPayload,
    @Param('id') targetId: string,
    @Body('role') role: UserRole,
    @Req() req: any,
  ) {
    return this.accountsService.updateRole(admin.sub, targetId, role, req.ip);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: '[Admin] Suspend or activate a moderator account — ADMIN only',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: Object.values(UserStatus) },
        reason: { type: 'string' },
      },
      required: ['status'],
    },
  })
  updateStatus(
    @CurrentUser() admin: AdminJwtPayload,
    @Param('id') targetId: string,
    @Body('status') status: UserStatus,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    return this.accountsService.updateStatus(
      admin.sub,
      targetId,
      status,
      reason,
      req.ip,
    );
  }
}
