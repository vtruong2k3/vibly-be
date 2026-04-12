import { IsString, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({ example: 'Great post!' })
  @IsString()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({ description: 'UUID of parent comment (for replies)' })
  @IsOptional()
  @IsUUID()
  parentCommentId?: string;
}
