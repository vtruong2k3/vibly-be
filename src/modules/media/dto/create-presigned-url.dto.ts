import { IsEnum, IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaType } from '@prisma/client';

export class CreatePresignedUrlDto {
  @ApiProperty({ enum: MediaType, example: MediaType.IMAGE })
  @IsEnum(MediaType)
  mediaType: MediaType;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  mimeType: string;

  @ApiProperty({ example: 'photo.jpg' })
  @IsString()
  originalFilename: string;

  @ApiPropertyOptional({ example: 2048576, description: 'File size in bytes' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100 * 1024 * 1024) // 100MB max
  sizeBytes?: number;
}
