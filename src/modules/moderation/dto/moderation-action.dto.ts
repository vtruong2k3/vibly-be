import { IsEnum, IsString, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModerationActionType, ReportTargetType } from '@prisma/client';

export class ModerationActionDto {
  @ApiPropertyOptional({ description: 'Related report UUID' })
  @IsOptional()
  @IsUUID()
  reportId?: string;

  @ApiProperty({ enum: ReportTargetType })
  @IsEnum(ReportTargetType)
  targetType: ReportTargetType;

  @ApiProperty({ description: 'UUID of entity to act on' })
  @IsString()
  targetId: string;

  @ApiProperty({ enum: ModerationActionType })
  @IsEnum(ModerationActionType)
  actionType: ModerationActionType;

  @ApiPropertyOptional({ description: 'Internal moderator note' })
  @IsOptional()
  @IsString()
  note?: string;
}
