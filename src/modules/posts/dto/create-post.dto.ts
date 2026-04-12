import {
  IsString,
  IsOptional,
  IsEnum,
  MaxLength,
  IsArray,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VisibilityLevel } from '@prisma/client';

export class CreatePostDto {
  @ApiPropertyOptional({ example: 'Just had a great coffee!' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @ApiPropertyOptional({
    enum: VisibilityLevel,
    default: VisibilityLevel.FRIENDS,
  })
  @IsOptional()
  @IsEnum(VisibilityLevel)
  visibility?: VisibilityLevel = VisibilityLevel.FRIENDS;

  @ApiPropertyOptional({ description: 'List of media asset UUIDs to attach' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  mediaIds?: string[];
}
