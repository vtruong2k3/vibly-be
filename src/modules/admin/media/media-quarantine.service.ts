import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { addDays } from 'date-fns';

@Injectable()
export class MediaQuarantineService {
  private readonly logger = new Logger(MediaQuarantineService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.s3 = new S3Client({
      region: this.config.get<string>('s3.region', 'ap-southeast-1'),
    });
    this.bucket = this.config.get<string>('s3.bucket', '');
  }

  // Quarantine all media for a post — sets 30-day purge deadline
  async quarantinePostMedia(postId: string, reason: string): Promise<void> {
    const postMedia = await this.prisma.postMedia.findMany({
      where: { postId },
      select: { mediaAssetId: true },
    });

    if (postMedia.length === 0) return;

    const mediaIds = postMedia.map((pm) => pm.mediaAssetId);
    const now = new Date();

    const updated = await this.prisma.mediaAsset.updateMany({
      where: { id: { in: mediaIds }, storageStatus: 'ACTIVE' },
      data: {
        storageStatus: 'QUARANTINED',
        quarantinedAt: now,
        purgeScheduledAt: addDays(now, 30), // 30-day grace period
        quarantineReason: reason,
      },
    });

    this.logger.log(
      `Quarantined ${updated.count} media assets for post ${postId}`,
    );
  }

  // Release quarantine — only call when restoring a post (before purge date)
  async releaseQuarantine(postId: string): Promise<void> {
    const postMedia = await this.prisma.postMedia.findMany({
      where: { postId },
      select: { mediaAssetId: true },
    });

    if (postMedia.length === 0) return;

    const mediaIds = postMedia.map((pm) => pm.mediaAssetId);

    // Only release QUARANTINED (not PURGED — those are gone forever)
    await this.prisma.mediaAsset.updateMany({
      where: { id: { in: mediaIds }, storageStatus: 'QUARANTINED' },
      data: {
        storageStatus: 'ACTIVE',
        quarantinedAt: null,
        purgeScheduledAt: null,
        quarantineReason: null,
        restoredAt: new Date(),
      },
    });
  }

  // CronJob: runs at 2:00 AM daily — permanently deletes S3 objects past purge date
  @Cron('0 2 * * *')
  async purgeDueMedia(): Promise<void> {
    const dueMedia = await this.prisma.mediaAsset.findMany({
      where: {
        storageStatus: 'QUARANTINED',
        purgeScheduledAt: { lte: new Date() },
      },
      select: { id: true, objectKey: true },
      take: 500, // Process in batches to avoid timeouts
    });

    if (dueMedia.length === 0) {
      this.logger.log('Purge cron: no media due for purge');
      return;
    }

    this.logger.log(`Purge cron: processing ${dueMedia.length} media assets`);
    let purged = 0;
    let failed = 0;

    for (const media of dueMedia) {
      try {
        await this.s3.send(
          new DeleteObjectCommand({ Bucket: this.bucket, Key: media.objectKey }),
        );
        await this.prisma.mediaAsset.update({
          where: { id: media.id },
          data: { storageStatus: 'PURGED', purgedAt: new Date() },
        });
        purged++;
      } catch (err) {
        failed++;
        this.logger.error(`Failed to purge media ${media.id}: ${String(err)}`);
        // Continue — don't abort the entire batch
      }
    }

    this.logger.log(
      `Purge cron complete: ${purged} purged, ${failed} failed`,
    );
  }
}
