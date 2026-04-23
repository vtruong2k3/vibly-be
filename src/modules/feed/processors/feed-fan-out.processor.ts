import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { FEED_JOBS, FEED_QUEUE, type FanOutPostJob } from '../feed.constants';

/**
 * FeedFanOutProcessor — async fan-out on write.
 *
 * When a post is published, we fan-out to all the author's friends by
 * inserting FeedEdge rows. The feed query then reads from feed_edges
 * instead of joining all friends' posts live, giving O(friends) fan-out
 * cost at write time and O(1) reads at query time.
 *
 * Celebrity / high-fanout threshold: if author has >1000 friends we skip
 * fan-out and fall back to the direct DB query in FeedService (fan-out on read).
 */
@Processor(FEED_QUEUE)
export class FeedFanOutProcessor extends WorkerHost {
    private readonly logger = new Logger(FeedFanOutProcessor.name);
    private static readonly FAN_OUT_LIMIT = 1000;

    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async process(job: Job): Promise<void> {
        if (job.name === FEED_JOBS.FAN_OUT_POST) {
            await this.handleFanOutPost(job.data as FanOutPostJob);
        }
    }

    private async handleFanOutPost({ postId, authorUserId }: FanOutPostJob) {
        // Get all friends of the author
        const friendships = await this.prisma.friendship.findMany({
            where: { userId: authorUserId },
            select: { friendId: true },
            take: FeedFanOutProcessor.FAN_OUT_LIMIT + 1,
        });

        // Celebrity gate: skip fan-out for high-follower accounts (>1000 friends)
        if (friendships.length > FeedFanOutProcessor.FAN_OUT_LIMIT) {
            this.logger.warn(
                `Celebrity fan-out skipped for user ${authorUserId} (${friendships.length} friends)`,
            );
            return;
        }

        if (friendships.length === 0) return;

        // Also include the author's own feed
        const ownerIds = [
            authorUserId,
            ...friendships.map((f) => f.friendId),
        ];

        // Batch upsert FeedEdge rows (idempotent — safe on job retry)
        await this.prisma.feedEdge.createMany({
            data: ownerIds.map((ownerUserId) => ({
                ownerUserId,
                actorUserId: authorUserId,
                postId,
                source: 'friend_post',
            })),
            skipDuplicates: true,
        });

        this.logger.debug(
            `Fan-out complete: post ${postId} → ${ownerIds.length} feed edges`,
        );
    }
}
