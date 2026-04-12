import { Controller, Get, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { ProfilesService } from '../../profiles/services/profiles.service';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UpdateProfileDto } from '../../profiles/dto/update-profile.dto';
import { SearchUsersDto } from '../dto/search-users.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly profilesService: ProfilesService,
  ) {}

  // GET /me
  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user with profile' })
  getMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.getMe(user.sub);
  }

  // PATCH /me
  @Patch('me')
  @ApiOperation({ summary: 'Update username' })
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateUserDto) {
    return this.usersService.updateMe(user.sub, dto);
  }

  // PATCH /me/profile
  @Patch('me/profile')
  @ApiOperation({ summary: 'Update profile info (bio, avatar, cover...)' })
  updateProfile(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.profilesService.updateProfile(user.sub, dto);
  }

  // GET /me/sessions
  @Get('me/sessions')
  @ApiOperation({ summary: 'List all active sessions for current user' })
  getMySessions(@CurrentUser() user: JwtPayload) {
    return this.usersService.getMySessions(user.sub);
  }

  // GET /users/search?q=
  @Get('search')
  @ApiOperation({ summary: 'Search users by username or display name' })
  searchUsers(@CurrentUser() user: JwtPayload, @Query() dto: SearchUsersDto) {
    return this.usersService.searchUsers(user.sub, dto);
  }

  // GET /users/:id
  @Get(':id')
  @ApiOperation({ summary: 'Get public profile of a user' })
  getUserById(@CurrentUser() user: JwtPayload, @Param('id') targetId: string) {
    return this.usersService.getUserById(user.sub, targetId);
  }
}
