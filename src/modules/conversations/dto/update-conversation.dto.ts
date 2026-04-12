import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateConversationDto {
  @ApiPropertyOptional({ example: 'New Group Name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
  
  @ApiPropertyOptional({ description: 'UUID of new avatar media' })
  @IsOptional()
  @IsString()
  avatarMediaId?: string;
}
