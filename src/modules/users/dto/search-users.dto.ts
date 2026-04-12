import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class SearchUsersDto {
  @ApiPropertyOptional({ example: 'john' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @Transform(({ value }) => (value as string)?.trim())
  q?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z', description: 'Cursor for pagination' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number = 20;
}
