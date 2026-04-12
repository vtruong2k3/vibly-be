import { Controller, Get, Post, Delete, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FeedService } from '../services/feed.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../../common/decorators/current-user.decorator';

@ApiTags('Feed')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get('feed')
  @ApiOperation({ summary: 'Get friend activity feed (cursor paginated)' })
  getFeed(
    @CurrentUser() user: JwtPayload,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.feedService.getFeed(user.sub, cursor, limit);
  }

  @Get('feed/saved')
  @ApiOperation({ summary: 'Get saved posts' })
  getSavedPosts(
    @CurrentUser() user: JwtPayload,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.feedService.getSavedPosts(user.sub, cursor, limit);
  }

  @Post('posts/:id/save')
  @ApiOperation({ summary: 'Save a post to collection' })
  savePost(@CurrentUser() user: JwtPayload, @Param('id') postId: string) {
    return this.feedService.savePost(user.sub, postId);
  }

  @Delete('posts/:id/save')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove post from saved collection' })
  unsavePost(@CurrentUser() user: JwtPayload, @Param('id') postId: string) {
    return this.feedService.unsavePost(user.sub, postId);
  }
}
