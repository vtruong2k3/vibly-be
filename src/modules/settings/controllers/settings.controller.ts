import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SettingsService } from '../services/settings.service';
import { UpdatePrivacySettingsDto } from '../dto/update-privacy-settings.dto';
import { UpdateNotificationSettingsDto } from '../dto/update-notification-settings.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../../common/decorators/current-user.decorator';

@ApiTags('Settings')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'settings', version: '1' })
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // GET /settings
  @Get()
  @ApiOperation({
    summary: 'Get all user settings (privacy, notifications, security)',
  })
  getAllSettings(@CurrentUser() user: JwtPayload) {
    return this.settingsService.getAllSettings(user.sub);
  }

  // PATCH /settings/privacy
  @Patch('privacy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update privacy settings' })
  updatePrivacy(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePrivacySettingsDto,
  ) {
    return this.settingsService.updatePrivacy(user.sub, dto);
  }

  // PATCH /settings/notifications
  @Patch('notifications')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update notification preferences' })
  updateNotifications(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.settingsService.updateNotifications(user.sub, dto);
  }
}
