import {
  IsString,
  IsOptional,
  MaxLength,
  IsArray,
  IsEnum,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageType } from '@prisma/client';

export class CreateMessageDto {
  @ApiProperty({ enum: MessageType, example: MessageType.TEXT })
  @IsEnum(MessageType)
  messageType: MessageType;

  @ApiPropertyOptional({ example: 'Hello there!' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @ApiPropertyOptional({ description: 'List of media asset UUIDs' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  mediaIds?: string[];
}
