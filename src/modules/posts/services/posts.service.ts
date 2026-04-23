import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { PostStatus, VisibilityLevel, CommentStatus, NotificationType } from '@prisma/client';
import { CreatePostDto } from '../dto/create-post.dto';
import { UpdatePostDto } from '../dto/update-post.dto';
import { CreateCommentDto } from '../dto/create-comment.dto';
import { ReactDto } from '../dto/react.dto';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { PostsGateway } from '../gateways/posts.gateway';
import { FeedService } from '../../feed/services/feed.service';
import { AutoModerationService } from '../../moderation/services/auto-moderation.service';
import { AdminGateway } from '../../admin/admin.gateway';

// Shared field selection — never expose passwordHash or sensitive data
const POST_SELECT = {
  id: true,
  content: true,
  visibility: true,
  status: true,
  commentCount: true,
  reactionCount: true,
  shareCount: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: {
      id: true,
      username: true,
      profile: { select: { displayName: true, avatarMediaId: true, avatarMedia: { select: { bucket: true, objectKey: true } } } },
    },
  },
  media: {
    select: {
      position: true,
      mediaAsset: {
        select: {
          id: true,
          objectKey: true,
          bucket: true,
          mimeType: true,
          mediaType: true,
          width: true,
          height: true,
        },
      },
    },
    orderBy: { position: 'asc' as const },
  },
};

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly postsGateway: PostsGateway,
    private readonly feedService: FeedService,
    private readonly autoMod: AutoModerationService,
    private readonly adminGateway: AdminGateway,
  ) { }

  // POST /posts
  async createPost(userId: string, dto: CreatePostDto) {
    if (!dto.content && (!dto.mediaIds || dto.mediaIds.length === 0)) {
      throw new BadRequestException('Post must have content or media');
    }

    // Phase 1 Auto-Moderation: Scan content for blacklisted keywords
    const isBad = await this.autoMod.containsBlacklistedKeyword(dto.content ?? '');
    const initialStatus = isBad ? PostStatus.HIDDEN : PostStatus.PUBLISHED;

    const post = await this.prisma.$transaction(async (tx) => {
      const newPost = await tx.post.create({
        data: {
          authorUserId: userId,
          content: dto.content,
          visibility: dto.visibility ?? VisibilityLevel.FRIENDS,
          status: initialStatus,
          publishedAt: new Date(),
        },
        select: POST_SELECT,
      });

      // Attach media assets in order
      if (dto.mediaIds && dto.mediaIds.length > 0) {
        await tx.postMedia.createMany({
          data: dto.mediaIds.map((mediaAssetId, index) => ({
            postId: newPost.id,
            mediaAssetId,
            position: index,
          })),
          skipDuplicates: true,
        });
      }

      return newPost;
    });

    if (isBad) {
      // Auto-report for admin review
      const autoReport = await this.prisma.report.create({
        data: {
          reporterUserId: userId, // System auto-reports using author's ID as reporter (or a SYSTEM user if available, but for simplicity we use author with a special reasonCode)
          targetType: 'POST',
          targetId: post.id,
          reasonCode: 'AUTO_MODERATION_FLAG',
          reasonText: 'Hệ thống phát hiện có chứa từ khóa nhạy cảm / bị cấm.',
          severity: 'HIGH',
        },
      });
      // Emit to Admins
      this.adminGateway.broadcastNewReport(autoReport);

      // Do not fan-out
      return post;
    }

    // Fire-and-forget fan-out: push FeedEdge rows to all friends asynchronously
    // This does NOT await — the HTTP response returns immediately
    void this.feedService.enqueueFanOut({
      postId: post.id,
      authorUserId: userId,
    });

    return post;
  }

  // PATCH /posts/:id
  async updatePost(userId: string, postId: string, dto: UpdatePostDto) {
    const post = await this.findOwnedPost(userId, postId);

    return this.prisma.post.update({
      where: { id: post.id },
      data: {
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.visibility !== undefined && { visibility: dto.visibility }),
      },
      select: POST_SELECT,
    });
  }

  // DELETE /posts/:id (soft delete per plan)
  async deletePost(userId: string, postId: string) {
    const post = await this.findOwnedPost(userId, postId);

    await this.prisma.post.update({
      where: { id: post.id },
      data: { deletedAt: new Date(), status: PostStatus.DELETED },
    });

    return { message: 'Post deleted' };
  }

  // GET /posts/:id
  async getPost(userId: string, postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, status: PostStatus.PUBLISHED, deletedAt: null },
      select: POST_SELECT,
    });

    if (!post) throw new NotFoundException('Post not found');
    await this.assertCanView(userId, post.author.id, post.visibility);
    return post;
  }

  // GET /users/:id/posts
  async getUserPosts(
    requestingUserId: string,
    authorId: string,
    cursor?: string,
    limit = 20,
  ) {
    const take = Math.min(limit, 50);

    // Determine visibility based on relationship
    const isFriend = await this.checkFriendship(requestingUserId, authorId);
    const visibilityFilter: VisibilityLevel[] = isFriend
      ? [VisibilityLevel.PUBLIC, VisibilityLevel.FRIENDS]
      : [VisibilityLevel.PUBLIC];

    const posts = await this.prisma.post.findMany({
      where: {
        authorUserId: authorId,
        status: PostStatus.PUBLISHED,
        deletedAt: null,
        visibility: {
          in: [
            ...visibilityFilter,
            ...(requestingUserId === authorId ? [VisibilityLevel.PRIVATE] : []),
          ],
        },
      },
      select: POST_SELECT,
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: posts,
      meta: {
        nextCursor: posts.length === take ? posts[posts.length - 1].id : null,
        count: posts.length,
      },
    };
  }

  // POST /posts/:id/reactions
  async reactToPost(userId: string, postId: string, dto: ReactDto) {
    const post = await this.assertPostExists(postId);

    // Upsert — change reaction type if already reacted
    const existing = await this.prisma.postReaction.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      return this.prisma.postReaction.update({
        where: { postId_userId: { postId, userId } },
        data: { reactionType: dto.reactionType },
      });
    }

    // Atomic: create reaction + increment counter cache
    const [, updatedPost] = await this.prisma.$transaction([
      this.prisma.postReaction.create({
        data: { postId, userId, reactionType: dto.reactionType },
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { reactionCount: { increment: 1 } },
        select: { reactionCount: true },
      }),
    ]);

    // Broadcast real-time reaction update to all clients
    this.postsGateway.broadcastPostReaction(postId, {
      postId,
      reactionCount: updatedPost.reactionCount,
    });

    // Notify post author (skip if reacting to own post)
    if (post.authorUserId !== userId) {
      this.notificationsService.createNotification({
        userId: post.authorUserId,
        actorUserId: userId,
        type: NotificationType.POST_REACTION,
        title: 'Yêu thích',
        body: 'đã thả tym vào bài viết của bạn.',
        entityType: 'post',
        entityId: postId,
      });
    }

    return { message: 'Reaction added' };
  }

  // DELETE /posts/:id/reactions
  async removeReaction(userId: string, postId: string) {
    const existing = await this.prisma.postReaction.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (!existing) throw new NotFoundException('Reaction not found');

    await this.prisma.$transaction([
      this.prisma.postReaction.delete({
        where: { postId_userId: { postId, userId } },
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { reactionCount: { decrement: 1 } },
      }),
    ]);

    return { message: 'Reaction removed' };
  }

  // POST /posts/:id/comments
  async addComment(userId: string, postId: string, dto: CreateCommentDto) {
    const post = await this.assertPostExists(postId);

    // Validate parent comment belongs to same post if provided
    if (dto.parentCommentId) {
      const parent = await this.prisma.comment.findFirst({
        where: { id: dto.parentCommentId, postId, deletedAt: null },
      });
      if (!parent) throw new NotFoundException('Parent comment not found');
    }

    const isBad = await this.autoMod.containsBlacklistedKeyword(dto.content);
    const initialStatus = isBad ? CommentStatus.HIDDEN : CommentStatus.PUBLISHED;

    const comment = await this.prisma.$transaction(async (tx) => {
      const newComment = await tx.comment.create({
        data: {
          postId,
          authorUserId: userId,
          content: dto.content,
          parentCommentId: dto.parentCommentId,
          status: initialStatus,
        },
        select: {
          id: true,
          content: true,
          parentCommentId: true,
          reactionCount: true,
          replyCount: true,
          createdAt: true,
          author: {
            select: {
              id: true,
              username: true,
              profile: { select: { displayName: true, avatarMediaId: true, avatarMedia: { select: { bucket: true, objectKey: true } } } },
            },
          },
        },
      });

      // Increment counters
      await tx.post.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      });

      if (dto.parentCommentId) {
        await tx.comment.update({
          where: { id: dto.parentCommentId },
          data: { replyCount: { increment: 1 } },
        });
      }

      return newComment;
    });

    if (isBad) {
      // Auto-report
      const autoReport = await this.prisma.report.create({
        data: {
          reporterUserId: userId,
          targetType: 'COMMENT',
          targetId: comment.id,
          reasonCode: 'AUTO_MODERATION_FLAG',
          reasonText: 'Hệ thống phát hiện có chứa từ khóa nhạy cảm / bị cấm.',
          severity: 'HIGH',
        },
      });

      this.adminGateway.broadcastNewReport(autoReport);

      return comment;
    }

    // Broadcast real-time new comment to all clients
    this.postsGateway.broadcastNewComment(postId, comment);

    // Notify post author (skip if commenting on own post)
    if (post.authorUserId !== userId) {
      this.notificationsService.createNotification({
        userId: post.authorUserId,
        actorUserId: userId,
        type: NotificationType.COMMENT_POST,
        title: 'Bình luận mới',
        body: 'đã bình luận vào bài viết của bạn.',
        entityType: 'post',
        entityId: postId,
      });
    }

    return comment;
  }

  // GET /posts/:id/comments
  async getComments(postId: string, cursor?: string, limit = 20) {
    const take = Math.min(limit, 50);

    const comments = await this.prisma.comment.findMany({
      where: {
        postId,
        parentCommentId: null, // Top-level comments only
        status: CommentStatus.PUBLISHED,
        deletedAt: null,
      },
      select: {
        id: true,
        content: true,
        reactionCount: true,
        replyCount: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            id: true,
            username: true,
            profile: { select: { displayName: true, avatarMediaId: true, avatarMedia: { select: { bucket: true, objectKey: true } } } },
          },
        },
      },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'asc' },
    });

    return {
      data: comments,
      meta: {
        nextCursor:
          comments.length === take ? comments[comments.length - 1].id : null,
        count: comments.length,
      },
    };
  }

  // PATCH /comments/:id
  async updateComment(userId: string, commentId: string, content: string) {
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, authorUserId: userId, deletedAt: null },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    return this.prisma.comment.update({
      where: { id: commentId },
      data: { content },
      select: { id: true, content: true, updatedAt: true },
    });
  }

  // DELETE /comments/:id (soft delete)
  async deleteComment(userId: string, commentId: string) {
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, authorUserId: userId, deletedAt: null },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.comment.update({
        where: { id: commentId },
        data: { deletedAt: new Date(), status: CommentStatus.DELETED },
      });

      // Decrement post comment count
      await tx.post.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: 1 } },
      });

      // Decrement parent reply count if reply
      if (comment.parentCommentId) {
        await tx.comment.update({
          where: { id: comment.parentCommentId },
          data: { replyCount: { decrement: 1 } },
        });
      }
    });

    return { message: 'Comment deleted' };
  }

  // === PRIVATE HELPERS ===
  private async findOwnedPost(userId: string, postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, authorUserId: userId, deletedAt: null },
      select: { id: true, authorUserId: true, visibility: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  private async assertPostExists(postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, status: PostStatus.PUBLISHED, deletedAt: null },
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  private async assertCanView(
    requestingUserId: string,
    authorId: string,
    visibility: VisibilityLevel,
  ) {
    if (requestingUserId === authorId) return; // Author can always view own posts
    if (visibility === VisibilityLevel.PUBLIC) return;
    if (visibility === VisibilityLevel.PRIVATE)
      throw new ForbiddenException('This post is private');

    // FRIENDS visibility: check friendship
    const isFriend = await this.checkFriendship(requestingUserId, authorId);
    if (!isFriend)
      throw new ForbiddenException('This post is only visible to friends');
  }

  private async checkFriendship(
    userId: string,
    friendId: string,
  ): Promise<boolean> {
    if (userId === friendId) return true;
    const friendship = await this.prisma.friendship.findUnique({
      where: { userId_friendId: { userId, friendId } },
    });
    return !!friendship;
  }
}
