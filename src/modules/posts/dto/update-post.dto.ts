import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { VisibilityLevel } from '@prisma/client';

export class UpdatePostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @ApiPropertyOptional({ enum: VisibilityLevel })
  @IsOptional()
  @IsEnum(VisibilityLevel)
  visibility?: VisibilityLevel;
}
