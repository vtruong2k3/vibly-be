import { IsEnum, IsArray, IsUUID, IsOptional, ArrayMinSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CallType } from '@prisma/client';

export class StartCallDto {
  @ApiProperty({ enum: CallType, example: CallType.VIDEO })
  @IsEnum(CallType)
  callType: CallType;

  @ApiPropertyOptional({ description: 'Conversation ID (for group calls)' })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiProperty({ type: [String], description: 'UUIDs of participants to invite' })
  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  participantIds: string[];
}
