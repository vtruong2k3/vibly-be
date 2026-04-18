import {
  IsEnum,
  IsOptional,
  IsString,
  IsDateString,
  IsArray,
  ArrayNotEmpty,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus, UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';

export class UserFilterDto {
  @ApiPropertyOptional({ enum: UserStatus })
  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  @ApiPropertyOptional({ enum: UserRole })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Search by username or email' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Cursor for pagination (user ID)' })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @Transform(({ value }) => parseInt(value, 10))
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ example: '2024-01-01' })
  @IsDateString()
  @IsOptional()
  createdFrom?: string;

  @ApiPropertyOptional({ example: '2024-12-31' })
  @IsDateString()
  @IsOptional()
  createdTo?: string;

  @ApiPropertyOptional({
    enum: ['createdAt', 'lastLoginAt', 'postCount'],
    default: 'createdAt',
  })
  @IsString()
  @IsOptional()
  sortBy?: string;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: UserStatus })
  @IsEnum(UserStatus)
  status: UserStatus;

  @ApiPropertyOptional({ description: 'Required for SUSPENDED and BANNED actions' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: UserRole, description: 'Cannot set to ADMIN via API' })
  @IsEnum(UserRole)
  role: UserRole;
}

export class BulkActionDto {
  @ApiProperty({ type: [String], description: 'Array of user IDs' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  userIds: string[];

  @ApiProperty({ enum: ['SUSPEND', 'ACTIVATE', 'BAN'] })
  @IsIn(['SUSPEND', 'ACTIVATE', 'BAN'])
  action: 'SUSPEND' | 'ACTIVATE' | 'BAN';

  @ApiProperty({ description: 'Reason for bulk action (required for audit log)' })
  @IsString()
  reason: string;
}
