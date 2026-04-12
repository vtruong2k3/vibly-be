import {
  Controller, Post, Get, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PostsService } from '../services/posts.service';
import { CreatePostDto } from '../dto/create-post.dto';
import { UpdatePostDto } from '../dto/update-post.dto';
import { CreateCommentDto } from '../dto/create-comment.dto';
import { ReactDto } from '../dto/react.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../../common/decorators/current-user.decorator';

@ApiTags('Posts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  // POST /posts
  @Post('posts')
  @ApiOperation({ summary: 'Create a new post' })
  createPost(@CurrentUser() user: JwtPayload, @Body() dto: CreatePostDto) {
    return this.postsService.createPost(user.sub, dto);
  }

  // GET /posts/:id
  @Get('posts/:id')
  @ApiOperation({ summary: 'Get a post by ID' })
  getPost(@CurrentUser() user: JwtPayload, @Param('id') postId: string) {
    return this.postsService.getPost(user.sub, postId);
  }

  // GET /users/:id/posts
  @Get('users/:id/posts')
  @ApiOperation({ summary: 'Get posts for a specific user' })
  getUserPosts(
    @CurrentUser() user: JwtPayload,
    @Param('id') authorId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.postsService.getUserPosts(user.sub, authorId, cursor, limit);
  }

  // PATCH /posts/:id
  @Patch('posts/:id')
  @ApiOperation({ summary: 'Update a post' })
  updatePost(@CurrentUser() user: JwtPayload, @Param('id') postId: string, @Body() dto: UpdatePostDto) {
    return this.postsService.updatePost(user.sub, postId, dto);
  }

  // DELETE /posts/:id
  @Delete('posts/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a post' })
  deletePost(@CurrentUser() user: JwtPayload, @Param('id') postId: string) {
    return this.postsService.deletePost(user.sub, postId);
  }

  // POST /posts/:id/reactions
  @Post('posts/:id/reactions')
  @ApiOperation({ summary: 'React to a post (like, love, haha...)' })
  reactToPost(@CurrentUser() user: JwtPayload, @Param('id') postId: string, @Body() dto: ReactDto) {
    return this.postsService.reactToPost(user.sub, postId, dto);
  }

  // DELETE /posts/:id/reactions
  @Delete('posts/:id/reactions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove reaction from a post' })
  removeReaction(@CurrentUser() user: JwtPayload, @Param('id') postId: string) {
    return this.postsService.removeReaction(user.sub, postId);
  }

  // POST /posts/:id/comments
  @Post('posts/:id/comments')
  @ApiOperation({ summary: 'Comment on a post' })
  addComment(@CurrentUser() user: JwtPayload, @Param('id') postId: string, @Body() dto: CreateCommentDto) {
    return this.postsService.addComment(user.sub, postId, dto);
  }

  // GET /posts/:id/comments
  @Get('posts/:id/comments')
  @ApiOperation({ summary: 'Get comments on a post (cursor paginated)' })
  getComments(
    @Param('id') postId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.postsService.getComments(postId, cursor, limit);
  }

  // PATCH /comments/:id
  @Patch('comments/:id')
  @ApiOperation({ summary: 'Edit a comment' })
  updateComment(@CurrentUser() user: JwtPayload, @Param('id') commentId: string, @Body('content') content: string) {
    return this.postsService.updateComment(user.sub, commentId, content);
  }

  // DELETE /comments/:id
  @Delete('comments/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a comment' })
  deleteComment(@CurrentUser() user: JwtPayload, @Param('id') commentId: string) {
    return this.postsService.deleteComment(user.sub, commentId);
  }
}
