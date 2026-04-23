import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { PostStatus, VisibilityLevel } from '@prisma/client';
import { FEED_JOBS, FEED_QUEUE, type FanOutPostJob } from '../feed.constants';

// Shared media select to build CDN URLs
const MEDIA_SELECT = {
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
};

const AUTHOR_SELECT = {
  select: {
    id: true,
    username: true,
    profile: {
      select: {
        displayName: true,
        avatarMediaId: true,
        avatarMedia: { select: { bucket: true, objectKey: true } },
      },
    },
  },
};

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @InjectQueue(FEED_QUEUE) private readonly feedQueue: Queue,
  ) { }

  // ─── Enqueue fan-out job (called by PostsService after post creation) ───────
  async enqueueFanOut(job: FanOutPostJob): Promise<void> {
    await this.feedQueue.add(FEED_JOBS.FAN_OUT_POST, job, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 200,
      removeOnFail: 50,
    });
    this.logger.debug(`Fan-out queued for post ${job.postId}`);
  }

  // ─── GET /feed — Hybrid strategy ────────────────────────────────────────────
  // Phase 2: read from feed_edges (fast) when available.
  // Falls back to direct friend post query when feed_edges has no data yet
  // (e.g. new user, celebrity account above fan-out threshold).
  async getFeed(userId: string, cursor?: string, limit = 20) {
    const take = Math.min(limit, 50);
    const cacheKey = `feed:${userId}:${cursor ?? 'initial'}:${take}`;

    const cachedFeed = await this.cacheManager.get(cacheKey);
    if (cachedFeed) {
      return cachedFeed;
    }

    // ── Phase 2: try feed_edges first ────────────────────────────────────────
    const hasEdges = await this.prisma.feedEdge.count({
      where: { ownerUserId: userId },
    });

    let posts: any[];
    if (hasEdges > 0) {
      posts = await this.readFromFeedEdges(userId, cursor, take);
    } else {
      // ── Phase 1 fallback: direct query (no edges yet / celebrity follow) ───
      posts = await this.readFromFriendPosts(userId, cursor, take);
    }

    const result = {
      data: posts.map((p) => ({
        ...p,
        myReaction: p.reactions?.[0]?.reactionType ?? null,
        isSaved: (p.saves?.length ?? 0) > 0,
        reactions: undefined,
        saves: undefined,
      })),
      meta: {
        nextCursor: posts.length === take ? posts[posts.length - 1].id : null,
        count: posts.length,
      },
    };

    await this.cacheManager.set(cacheKey, result, 30_000); // 30s TTL
    return result;
  }

  // ─── PRIVATE: read posts from pre-materialized feed_edges ───────────────────
  private async readFromFeedEdges(userId: string, cursor: string | undefined, take: number) {
    // Step 1: get ordered postIds from feed_edges (cursor uses FeedEdge.id)
    const cursorEdge = cursor
      ? await this.prisma.feedEdge.findFirst({ where: { postId: cursor, ownerUserId: userId }, select: { id: true } })
      : null;

    const edges = await this.prisma.feedEdge.findMany({
      where: { ownerUserId: userId },
      select: { id: true, postId: true },
      take,
      ...(cursorEdge ? { cursor: { id: cursorEdge.id }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    if (edges.length === 0) return [];

    const postIds = edges.map((e) => e.postId);

    // Step 2: batch fetch actual posts — preserving order via Map
    const posts = await this.prisma.post.findMany({
      where: {
        id: { in: postIds },
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
        author: AUTHOR_SELECT,
        media: { select: MEDIA_SELECT, orderBy: { position: 'asc' } },
        reactions: { where: { userId }, select: { reactionType: true } },
        saves: { where: { userId }, select: { id: true } },
      },
    });

    // Restore edge ordering
    const postMap = new Map(posts.map((p) => [p.id, p]));
    return postIds.map((id) => postMap.get(id)).filter(Boolean);
  }

  // ─── PRIVATE: Phase 1 fallback — direct query on friends' posts ─────────────
  private async readFromFriendPosts(userId: string, cursor: string | undefined, take: number) {
    const friendships = await this.prisma.friendship.findMany({
      where: { userId },
      select: { friendId: true },
    });

    const authorIds = [userId, ...friendships.map((f) => f.friendId)];

    return this.prisma.post.findMany({
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
        author: AUTHOR_SELECT,
        media: { select: MEDIA_SELECT, orderBy: { position: 'asc' } },
        reactions: { where: { userId }, select: { reactionType: true } },
        saves: { where: { userId }, select: { id: true } },
      },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── POST /posts/:id/save ────────────────────────────────────────────────────
  async savePost(userId: string, postId: string) {
    await this.prisma.postSave.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId },
      update: {},
    });
    return { message: 'Post saved' };
  }

  // ─── DELETE /posts/:id/save ──────────────────────────────────────────────────
  async unsavePost(userId: string, postId: string) {
    await this.prisma.postSave.deleteMany({ where: { postId, userId } });
    return { message: 'Post unsaved' };
  }

  // ─── GET /feed/saved ─────────────────────────────────────────────────────────
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
            author: AUTHOR_SELECT,
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
