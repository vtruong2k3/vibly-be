import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { PostStatus, VisibilityLevel } from '@prisma/client';

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  // GET /feed?cursor= — Friend activity feed with cursor pagination
  // Plan: fan-out-on-write via feed_edges (Phase 2 build)
  async getFeed(userId: string, cursor?: string, limit = 20) {
    const take = Math.min(limit, 50);
    const cacheKey = `feed:${userId}:${cursor ?? 'initial'}:${take}`;

    const cachedFeed = await this.cacheManager.get(cacheKey);
    if (cachedFeed) {
      return cachedFeed;
    }

    // Phase 1 fallback: direct query from friends' posts (no feed_edges yet)
    // Phase 2 upgrade: read from feed_edges table for true fan-out
    const friendships = await this.prisma.friendship.findMany({
      where: { userId },
      select: { friendId: true },
    });

    const friendIds = friendships.map((f) => f.friendId);
    // Include own posts in feed
    const authorIds = [...friendIds, userId];

    const posts = await this.prisma.post.findMany({
      where: {
        authorUserId: { in: authorIds },
        status: PostStatus.PUBLISHED,
        deletedAt: null,
        visibility: { in: [VisibilityLevel.PUBLIC, VisibilityLevel.FRIENDS] },
      },
      select: {
        id: true,
        content: true,
        visibility: true,
        commentCount: true,
        reactionCount: true,
        shareCount: true,
        publishedAt: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            username: true,
            profile: { select: { displayName: true, avatarMediaId: true } },
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
          orderBy: { position: 'asc' },
        },
        // Include requesting user's reaction
        reactions: {
          where: { userId },
          select: { reactionType: true },
        },
        saves: {
          where: { userId },
          select: { id: true },
        },
      },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const result = {
      data: posts.map((p) => ({
        ...p,
        myReaction: p.reactions[0]?.reactionType ?? null,
        isSaved: p.saves.length > 0,
        reactions: undefined,
        saves: undefined,
      })),
      meta: {
        nextCursor: posts.length === take ? posts[posts.length - 1].id : null,
        count: posts.length,
      },
    };

    // Cache the result for 30 seconds
    await this.cacheManager.set(cacheKey, result, 30000);

    return result;
  }

  // POST /posts/:id/save
  async savePost(userId: string, postId: string) {
    await this.prisma.postSave.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId },
      update: {},
    });
    return { message: 'Post saved' };
  }

  // DELETE /posts/:id/save
  async unsavePost(userId: string, postId: string) {
    await this.prisma.postSave.deleteMany({ where: { postId, userId } });
    return { message: 'Post unsaved' };
  }

  // GET /feed/saved
  async getSavedPosts(userId: string, cursor?: string, limit = 20) {
    const take = Math.min(limit, 50);

    const saves = await this.prisma.postSave.findMany({
      where: { userId },
      include: {
        post: {
          select: {
            id: true,
            content: true,
            visibility: true,
            commentCount: true,
            reactionCount: true,
            createdAt: true,
            author: {
              select: {
                id: true,
                username: true,
                profile: { select: { displayName: true, avatarMediaId: true } },
              },
            },
          },
        },
      },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const validSaves = saves.filter(
      (s) =>
        s.post.visibility !== VisibilityLevel.PRIVATE ||
        s.post.author.id === userId,
    );

    return {
      data: validSaves.map((s) => s.post),
      meta: {
        nextCursor: saves.length === take ? saves[saves.length - 1].id : null,
        count: validSaves.length,
      },
    };
  }
}
