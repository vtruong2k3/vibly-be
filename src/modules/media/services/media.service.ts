import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { MediaStatus } from '@prisma/client';
import { CreatePresignedUrlDto } from '../dto/create-presigned-url.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.bucket = this.config.get<string>('s3.bucket', 'vibly-media');
    this.s3 = new S3Client({
      region: this.config.get<string>('s3.region', 'ap-southeast-1'),
      credentials: {
        accessKeyId: this.config.get<string>('s3.accessKeyId', ''),
        secretAccessKey: this.config.get<string>('s3.secretAccessKey', ''),
      },
      ...(this.config.get<string>('s3.endpoint')
        ? { endpoint: this.config.get<string>('s3.endpoint') }
        : {}),
    });
  }

  // POST /media/presigned-url — Plan requirement: S3 direct upload flow
  // Flow: 1. Client calls this → 2. Gets presigned URL → 3. Uploads directly to S3 → 4. Calls confirm endpoint
  async createPresignedUrl(userId: string, dto: CreatePresignedUrlDto) {
    const ext = this.getExtension(dto.mimeType);
    const objectKey = `uploads/${userId}/${randomUUID()}${ext}`;

    // Create media_asset record in UPLOADING status BEFORE S3 upload
    const mediaAsset = await this.prisma.mediaAsset.create({
      data: {
        ownerUserId: userId,
        storageProvider: 's3',
        bucket: this.bucket,
        objectKey,
        originalFilename: dto.originalFilename,
        mimeType: dto.mimeType,
        mediaType: dto.mediaType,
        sizeBytes: dto.sizeBytes ?? 0,
        status: MediaStatus.UPLOADING,
      },
      select: { id: true, objectKey: true, bucket: true, mimeType: true, status: true },
    });

    // Generate short-lived presigned URL for direct S3 upload
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: dto.mimeType,
      Metadata: {
        userId,
        mediaAssetId: mediaAsset.id,
      },
    });

    const presignedUrl = await getSignedUrl(this.s3, command, {
      expiresIn: this.config.get<number>('s3.presignedUrlExpiry', 3600),
    });

    return {
      mediaAssetId: mediaAsset.id,
      presignedUrl,
      objectKey,
      expiresIn: 3600,
    };
  }

  // PATCH /media/:id/confirm — Mark upload as READY after client confirms upload success
  async confirmUpload(userId: string, mediaAssetId: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaAssetId, ownerUserId: userId, status: MediaStatus.UPLOADING },
    });

    if (!asset) {
      return { message: 'Media asset not found or already confirmed' };
    }

    await this.prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: { status: MediaStatus.READY },
    });

    return { mediaAssetId, status: MediaStatus.READY };
  }

  // GET /media/:id
  async getMediaAsset(userId: string, mediaAssetId: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaAssetId, ownerUserId: userId, deletedAt: null },
    });
    return asset;
  }

  // Soft-delete: mark as DELETED (BullMQ job cleans up from S3 asynchronously — Phase 2)
  async deleteMediaAsset(userId: string, mediaAssetId: string) {
    await this.prisma.mediaAsset.updateMany({
      where: { id: mediaAssetId, ownerUserId: userId },
      data: { status: MediaStatus.DELETED, deletedAt: new Date() },
    });
    return { message: 'Media asset marked for deletion' };
  }

  private getExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'audio/mpeg': '.mp3',
      'audio/ogg': '.ogg',
    };
    return map[mimeType] ?? '';
  }
}
