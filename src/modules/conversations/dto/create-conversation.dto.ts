import {
  IsString,
  IsArray,
  IsOptional,
  IsEnum,
  MaxLength,
  MinLength,
  ArrayMinSize,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationType } from '@prisma/client';

export class CreateConversationDto {
  @ApiProperty({ enum: ConversationType, example: ConversationType.DIRECT })
  @IsEnum(ConversationType)
  type: ConversationType;

  @ApiPropertyOptional({
    example: 'Weekend Trip',
    description: 'Required for GROUP type',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiProperty({ type: [String], description: 'List of participant UUIDs' })
  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  participantIds: string[];
}
