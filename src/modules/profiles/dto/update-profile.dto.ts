import {
  IsOptional,
  IsString,
  IsUrl,
  IsDateString,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ example: 'Software engineer at Vibly' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ example: '1995-08-15' })
  @IsOptional()
  @IsDateString()
  birthday?: string;

  @ApiPropertyOptional({ example: 'male' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  gender?: string;

  @ApiPropertyOptional({ example: 'Hanoi' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  hometown?: string;

  @ApiPropertyOptional({ example: 'Ho Chi Minh City' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  currentCity?: string;

  @ApiPropertyOptional({ example: 'https://johndev.com' })
  @IsOptional()
  @IsUrl()
  @MaxLength(255)
  website?: string;

  @ApiPropertyOptional({ description: 'UUID of media asset for avatar' })
  @IsOptional()
  @IsString()
  avatarMediaId?: string;

  @ApiPropertyOptional({ description: 'UUID of media asset for cover photo' })
  @IsOptional()
  @IsString()
  coverMediaId?: string;

  @ApiPropertyOptional({ example: 'Hanoi University' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  education?: string;

  @ApiPropertyOptional({ example: 'Single' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  maritalStatus?: string;
}
