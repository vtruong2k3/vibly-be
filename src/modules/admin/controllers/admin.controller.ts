import { Controller, Get, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdminService } from '../services/admin.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../../common/decorators/current-user.decorator';
import { IsEnum } from 'class-validator';
import { UserStatus, UserRole } from '@prisma/client';

// ── Body DTOs (inline, simple enough) ──────────────────────────────────────
class UpdateRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}

class UpdateStatusDto {
  @IsEnum(UserStatus)
  status: UserStatus;
}

@ApiTags('Admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN') // Entire controller ADMIN-only
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // GET /admin/stats
  @Get('stats')
  @ApiOperation({ summary: '[Admin] Platform statistics overview' })
  getStats() {
    return this.adminService.getStats();
  }

  // GET /admin/users
  @Get('users')
  @ApiOperation({ summary: '[Admin] List all users with filters' })
  @ApiQuery({ name: 'status', enum: UserStatus, required: false })
  @ApiQuery({ name: 'role', enum: UserRole, required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getUsers(
    @Query('status') status?: UserStatus,
    @Query('role') role?: UserRole,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.getUsers({ status, role, search, cursor, limit });
  }

  // PATCH /admin/users/:id/role
  @Patch('users/:id/role')
  @ApiOperation({ summary: '[Admin] Update a user role' })
  updateRole(
    @CurrentUser() admin: JwtPayload,
    @Param('id') userId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.adminService.updateUserRole(admin.sub, userId, dto.role);
  }

  // PATCH /admin/users/:id/status
  @Patch('users/:id/status')
  @ApiOperation({ summary: '[Admin] Suspend or restore a user' })
  updateStatus(
    @CurrentUser() admin: JwtPayload,
    @Param('id') userId: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.adminService.updateUserStatus(admin.sub, userId, dto.status);
  }

  // GET /admin/audit-logs
  @Get('audit-logs')
  @ApiOperation({ summary: '[Admin] View audit log trail' })
  getAuditLogs(@Query('cursor') cursor?: string, @Query('limit') limit?: number) {
    return this.adminService.getAuditLogs(cursor, limit);
  }
}
