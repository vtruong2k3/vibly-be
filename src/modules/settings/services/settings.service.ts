import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { UpdatePrivacySettingsDto } from '../dto/update-privacy-settings.dto';
import { UpdateNotificationSettingsDto } from '../dto/update-notification-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllSettings(userId: string) {
    const [privacy, notifications, security] = await Promise.all([
      this.prisma.userPrivacySettings.findUnique({ where: { userId } }),
      this.prisma.userNotificationSettings.findUnique({ where: { userId } }),
      this.prisma.userSecuritySettings.findUnique({
        where: { userId },
        select: { twoFactorEnabled: true, passwordChangedAt: true },
      }),
    ]);

    return { privacy, notifications, security };
  }

  async updatePrivacy(userId: string, dto: UpdatePrivacySettingsDto) {
    return this.prisma.userPrivacySettings.update({
      where: { userId },
      data: {
        ...(dto.profileVisibility && {
          profileVisibility: dto.profileVisibility,
        }),
        ...(dto.friendListVisibility && {
          friendListVisibility: dto.friendListVisibility,
        }),
        ...(dto.allowFriendRequestsFrom && {
          allowFriendRequestsFrom: dto.allowFriendRequestsFrom,
        }),
        ...(dto.allowMessagesFrom && {
          allowMessagesFrom: dto.allowMessagesFrom,
        }),
        ...(dto.allowCallsFrom && { allowCallsFrom: dto.allowCallsFrom }),
        ...(dto.showOnlineStatus !== undefined && {
          showOnlineStatus: dto.showOnlineStatus,
        }),
        ...(dto.showLastSeen !== undefined && {
          showLastSeen: dto.showLastSeen,
        }),
      },
    });
  }

  async updateNotifications(
    userId: string,
    dto: UpdateNotificationSettingsDto,
  ) {
    return this.prisma.userNotificationSettings.update({
      where: { userId },
      data: {
        ...(dto.likeEnabled !== undefined && { likeEnabled: dto.likeEnabled }),
        ...(dto.commentEnabled !== undefined && {
          commentEnabled: dto.commentEnabled,
        }),
        ...(dto.friendRequestEnabled !== undefined && {
          friendRequestEnabled: dto.friendRequestEnabled,
        }),
        ...(dto.messageEnabled !== undefined && {
          messageEnabled: dto.messageEnabled,
        }),
        ...(dto.callEnabled !== undefined && { callEnabled: dto.callEnabled }),
        ...(dto.emailNotificationsEnabled !== undefined && {
          emailNotificationsEnabled: dto.emailNotificationsEnabled,
        }),
        ...(dto.pushNotificationsEnabled !== undefined && {
          pushNotificationsEnabled: dto.pushNotificationsEnabled,
        }),
      },
    });
  }
}
