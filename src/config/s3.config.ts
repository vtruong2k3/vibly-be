import { registerAs } from '@nestjs/config';

export const s3Config = registerAs('s3', () => ({
  region: process.env.AWS_REGION ?? 'ap-southeast-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  bucket: process.env.AWS_S3_BUCKET ?? 'vibly-media',
  endpoint: process.env.S3_ENDPOINT, // For MinIO local dev
  presignedUrlExpiry: 3600, // 1 hour
}));
