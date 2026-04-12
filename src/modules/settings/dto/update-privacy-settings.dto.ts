import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PrivacyVisibility, AllowFrom } from '@prisma/client';

export class UpdatePrivacySettingsDto {
  @ApiPropertyOptional({ enum: PrivacyVisibility })
  @IsOptional()
  @IsEnum(PrivacyVisibility)
  profileVisibility?: PrivacyVisibility;

  @ApiPropertyOptional({ enum: PrivacyVisibility })
  @IsOptional()
  @IsEnum(PrivacyVisibility)
  friendListVisibility?: PrivacyVisibility;

  @ApiPropertyOptional({ enum: AllowFrom })
  @IsOptional()
  @IsEnum(AllowFrom)
  allowFriendRequestsFrom?: AllowFrom;

  @ApiPropertyOptional({ enum: AllowFrom })
  @IsOptional()
  @IsEnum(AllowFrom)
  allowMessagesFrom?: AllowFrom;

  @ApiPropertyOptional({ enum: AllowFrom })
  @IsOptional()
  @IsEnum(AllowFrom)
  allowCallsFrom?: AllowFrom;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showOnlineStatus?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showLastSeen?: boolean;
}
