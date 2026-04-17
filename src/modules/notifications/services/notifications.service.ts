import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { NotificationsGateway } from '../gateways/notifications.gateway';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  // Internal method to be called by other modules
  async createNotification(data: {
    userId: string;
    actorUserId?: string;
    type: NotificationType;
    title?: string;
    body?: string;
    entityType?: string;
    entityId?: string;
    metadata?: any;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        actorUserId: data.actorUserId,
        type: data.type,
        title: data.title,
        body: data.body,
        entityType: data.entityType,
        entityId: data.entityId,
        metadata: data.metadata,
      },
      include: {
        actor: {
          select: {
            username: true,
            profile: { select: { displayName: true, avatarMediaId: true, avatarMedia: { select: { bucket: true, objectKey: true } } } },
          },
        },
      },
    });

    this.notificationsGateway.broadcastNotification(data.userId, notification);
    return notification;
  }

  async getNotifications(userId: string, cursor?: string, limit = 50) {
    const take = Math.min(limit, 100);
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            username: true,
            profile: { select: { displayName: true, avatarMediaId: true, avatarMedia: { select: { bucket: true, objectKey: true } } } },
          },
        },
      },
    });

    return {
      data: notifications,
      meta: {
        nextCursor:
          notifications.length === take
            ? notifications[notifications.length - 1].id
            : null,
      },
    };
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { message: 'All notifications marked as read' };
  }
}
