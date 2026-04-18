import {
  Controller,
  Get,
  Patch,
  Delete,
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
import { AdminContentService } from './admin-content.service';
import { UserRole } from '@prisma/client';

@ApiTags('Admin Content')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MODERATOR)
@Controller({ path: 'admin/content', version: '1' })
export class AdminContentController {
  constructor(private readonly contentService: AdminContentService) {}

  // --- POSTS ---

  @Get('posts')
  @ApiOperation({ summary: '[Admin] List posts with moderation filters' })
  getPosts(
    @Query('status') status?: string,
    @Query('authorId') authorId?: string,
    @Query('hasReports') hasReports?: string,
    @Query('keyword') keyword?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.contentService.getPosts({
      status,
      authorId,
      hasReports: hasReports === 'true',
      keyword,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
      dateFrom,
      dateTo,
    });
  }

  @Get('posts/:id')
  @ApiOperation({ summary: '[Admin] Get post detail with media status and open reports' })
  getPostDetail(@Param('id') id: string) {
    return this.contentService.getPostDetail(id);
  }

  @Patch('posts/:id/remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Soft-remove post + quarantine media' })
  @ApiBody({ schema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] } })
  removePost(
    @CurrentUser() admin: AdminJwtPayload,
    @Param('id') postId: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    return this.contentService.removePost(admin.sub, postId, reason, req.ip);
  }

  @Patch('posts/:id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Restore post (403 if media already purged)' })
  restorePost(
    @CurrentUser() admin: AdminJwtPayload,
    @Param('id') postId: string,
    @Req() req: any,
  ) {
    return this.contentService.restorePost(admin.sub, postId, req.ip);
  }

  // --- COMMENTS ---

  @Get('comments')
  @ApiOperation({ summary: '[Admin] List comments with moderation filters' })
  getComments(
    @Query('postId') postId?: string,
    @Query('authorId') authorId?: string,
    @Query('hasReports') hasReports?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contentService.getComments({
      postId,
      authorId,
      hasReports: hasReports === 'true',
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Patch('comments/:id/remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Remove comment' })
  @ApiBody({ schema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] } })
  removeComment(
    @CurrentUser() admin: AdminJwtPayload,
    @Param('id') commentId: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    return this.contentService.removeComment(admin.sub, commentId, reason, req.ip);
  }
}
