import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AdminAuditService } from '../audit-log/admin-audit.service';
import { MediaQuarantineService } from '../media/media-quarantine.service';

@Injectable()
export class AdminContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AdminAuditService,
    private readonly quarantineService: MediaQuarantineService,
  ) {}

  // List posts with moderation filters
  async getPosts(params: {
    status?: string;
    authorId?: string;
    hasReports?: boolean;
    keyword?: string;
    cursor?: string;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const take = Math.min(params.limit ?? 30, 100);

    const posts = await this.prisma.post.findMany({
      where: {
        ...(params.status && { status: params.status as any }),
        ...(params.authorId && { authorUserId: params.authorId }),
        ...(params.keyword && {
          content: { contains: params.keyword, mode: 'insensitive' },
        }),
        ...((params.dateFrom || params.dateTo) && {
          createdAt: {
            ...(params.dateFrom && { gte: new Date(params.dateFrom) }),
            ...(params.dateTo && { lte: new Date(params.dateTo) }),
          },
        }),
      },
      select: {
        id: true,
        content: true,
        status: true,
        visibility: true,
        createdAt: true,
        deletedAt: true,
        author: { select: { id: true, username: true, status: true } },
        _count: {
          select: { reactions: true, comments: true, media: true },
        },
      },
      take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: posts,
      meta: {
        nextCursor: posts.length === take ? posts[posts.length - 1].id : null,
      },
    };
  }

  // Get single post with media and reports
  async getPostDetail(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: { select: { id: true, username: true, role: true, status: true } },
        media: {
          include: {
            mediaAsset: {
              select: {
                id: true,
                mimeType: true,
                mediaType: true,
                storageStatus: true,
                quarantinedAt: true,
                purgeScheduledAt: true,
              },
            },
          },
        },
        _count: { select: { reactions: true, comments: true } },
      },
    });

    if (!post) throw new NotFoundException('Post not found');

    // Fetch open reports separately (Post has no direct reports relation in schema)
    const openReports = await this.prisma.report.findMany({
      where: { targetType: 'POST', targetId: postId, status: 'OPEN' },
      select: {
        id: true,
        reasonCode: true,
        severity: true,
        createdAt: true,
        reporter: { select: { id: true, username: true } },
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    return { ...post, openReports };
  }

  // Soft remove post + quarantine media
  async removePost(
    actorId: string,
    postId: string,
    reason: string,
    ip?: string,
  ) {
    if (!reason?.trim()) {
      throw new BadRequestException('A reason is required to remove a post');
    }

    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    await this.prisma.post.update({
      where: { id: postId },
      data: { status: 'HIDDEN', deletedAt: new Date() },
    });

    // Start 30-day purge clock on all attached media
    await this.quarantineService.quarantinePostMedia(postId, reason);
    await this.auditService.write(
      actorId,
      'POST_REMOVED',
      'POST',
      postId,
      {},
      ip,
      undefined,
      reason,
    );

    return { id: postId, status: 'HIDDEN' };
  }

  // Restore post — blocked if media already purged
  async restorePost(actorId: string, postId: string, ip?: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        media: {
          include: {
            mediaAsset: { select: { id: true, storageStatus: true } },
          },
        },
      },
    });

    if (!post) throw new NotFoundException('Post not found');

    const hasPurgedMedia = post.media.some(
      (m) => m.mediaAsset.storageStatus === 'PURGED',
    );

    if (hasPurgedMedia) {
      throw new ConflictException({
        code: 'MEDIA_ALREADY_PURGED',
        message:
          'Cannot restore post — one or more media files have been permanently deleted',
      });
    }

    await this.prisma.post.update({
      where: { id: postId },
      data: { status: 'PUBLISHED', deletedAt: null },
    });

    await this.quarantineService.releaseQuarantine(postId);
    await this.auditService.write(
      actorId,
      'POST_RESTORED',
      'POST',
      postId,
      {},
      ip,
    );

    return { id: postId, status: 'PUBLISHED' };
  }

  // List comments with filters
  async getComments(params: {
    postId?: string;
    authorId?: string;
    hasReports?: boolean;
    cursor?: string;
    limit?: number;
  }) {
    const take = Math.min(params.limit ?? 30, 100);

    const comments = await this.prisma.comment.findMany({
      where: {
        ...(params.postId && { postId: params.postId }),
        ...(params.authorId && { authorUserId: params.authorId }),
        ...(params.hasReports && { }),
      },
      select: {
        id: true,
        content: true,
        status: true,
        createdAt: true,
        deletedAt: true,
        author: { select: { id: true, username: true } },
        post: { select: { id: true, content: true } },
      },
      take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: comments,
      meta: {
        nextCursor: comments.length === take ? comments[comments.length - 1].id : null,
      },
    };
  }

  // Remove comment
  async removeComment(
    actorId: string,
    commentId: string,
    reason: string,
    ip?: string,
  ) {
    if (!reason?.trim()) {
      throw new BadRequestException('A reason is required to remove a comment');
    }

    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    await this.prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date(), status: 'DELETED' },
    });

    await this.auditService.write(
      actorId,
      'COMMENT_REMOVED',
      'COMMENT',
      commentId,
      {},
      ip,
      undefined,
      reason,
    );

    return { id: commentId, removed: true };
  }
}
