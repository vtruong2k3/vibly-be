import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AdminJwtPayload } from '../auth/admin-jwt.strategy';
import { AdminUsersService } from './admin-users.service';
import {
  UserFilterDto,
  UpdateUserStatusDto,
  UpdateUserRoleDto,
  BulkActionDto,
} from './dto/user-filter.dto';
import { UserRole } from '@prisma/client';

@ApiTags('Admin Users')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MODERATOR)
@Controller({ path: 'admin/users', version: '1' })
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] List users with filters and pagination' })
  getUsers(@Query() query: UserFilterDto) {
    return this.usersService.getUsers(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '[Admin] Get user detail + last 10 moderation events' })
  getUserDetail(@Param('id') id: string) {
    return this.usersService.getUserDetail(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: '[Admin] Update user status — MODERATOR can suspend, ADMIN can ban',
  })
  updateStatus(
    @CurrentUser() admin: AdminJwtPayload,
    @Param('id') userId: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() req: any,
  ) {
    return this.usersService.updateUserStatus(
      admin.sub,
      admin.role,
      userId,
      dto.status,
      dto.reason,
      req.ip,
    );
  }

  @Patch(':id/role')
  @Roles(UserRole.ADMIN) // Fine-grained override — ADMIN only
  @ApiOperation({ summary: '[Admin] Change user role — ADMIN only' })
  updateRole(
    @CurrentUser() admin: AdminJwtPayload,
    @Param('id') userId: string,
    @Body() dto: UpdateUserRoleDto,
    @Req() req: any,
  ) {
    return this.usersService.updateUserRole(
      admin.sub,
      admin.role,
      userId,
      dto.role,
      req.ip,
    );
  }

  @Post('bulk-action')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[Admin] Bulk status action on multiple users — ADMIN only',
  })
  bulkAction(
    @CurrentUser() admin: AdminJwtPayload,
    @Body() dto: BulkActionDto,
    @Req() req: any,
  ) {
    return this.usersService.bulkAction(
      admin.sub,
      admin.role,
      dto.userIds,
      dto.action,
      dto.reason,
      req.ip,
    );
  }
}
