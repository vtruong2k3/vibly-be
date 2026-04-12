import { IsEnum, IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportTargetType } from '@prisma/client';

export class CreateReportDto {
  @ApiProperty({ enum: ReportTargetType, example: ReportTargetType.POST })
  @IsEnum(ReportTargetType)
  targetType: ReportTargetType;

  @ApiProperty({ description: 'UUID of the reported entity' })
  @IsString()
  targetId: string;

  @ApiProperty({ example: 'SPAM', description: 'Short reason code (e.g. SPAM, HARASSMENT, NUDITY)' })
  @IsString()
  @MaxLength(120)
  reasonCode: string;

  @ApiPropertyOptional({ description: 'Optional detailed description' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reasonText?: string;
}
