import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { CreateMessageDto } from '../dto/create-message.dto';
import { MessageStatus } from '@prisma/client';
import { MessagesGateway } from '../gateways/messages.gateway';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messagesGateway: MessagesGateway,
  ) {}

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: CreateMessageDto,
  ) {
    // 1. Verify membership
    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!membership)
      throw new ForbiddenException('You are not a member of this conversation');

    // 2. Validate input based on messageType
    if (dto.messageType === 'TEXT' && !dto.content) {
      throw new BadRequestException('Text message requires content');
    }
    if (
      dto.messageType !== 'TEXT' &&
      (!dto.mediaIds || dto.mediaIds.length === 0)
    ) {
      throw new BadRequestException(
        'Media message requires at least one media attached',
      );
    }

    // 3. Save message and attachments in transaction
    const message = await this.prisma.$transaction(async (tx) => {
      const newMsg = await tx.message.create({
        data: {
          conversationId,
          senderUserId: userId,
          content: dto.content,
          messageType: dto.messageType,
          status: MessageStatus.SENT,
        },
        select: {
          id: true,
          content: true,
          messageType: true,
          status: true,
          createdAt: true,
          senderUserId: true,
          sender: {
            select: {
              username: true,
              profile: { select: { displayName: true, avatarMediaId: true } },
            },
          },
        },
      });

      if (dto.mediaIds && dto.mediaIds.length > 0) {
        await tx.messageAttachment.createMany({
          data: dto.mediaIds.map((mediaAssetId) => ({
            messageId: newMsg.id,
            mediaAssetId,
          })),
        });
      }

      // Update conversation updatedAt + increment member unread count
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      await tx.conversationMember.updateMany({
        where: { conversationId, NOT: { userId } },
        data: { unreadCount: { increment: 1 } },
      });

      return newMsg;
    });

    // 4. Hybrid: Broadcast via WebSocket
    this.messagesGateway.broadcastNewMessage(conversationId, message);

    return message;
  }

  async getMessages(
    userId: string,
    conversationId: string,
    cursor?: string,
    limit = 50,
  ) {
    const take = Math.min(limit, 100);

    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!membership)
      throw new ForbiddenException('Not a member of this conversation');

    const messages = await this.prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      select: {
        id: true,
        content: true,
        messageType: true,
        status: true,
        createdAt: true,
        senderUserId: true,
        sender: {
          select: {
            username: true,
            profile: { select: { displayName: true, avatarMediaId: true } },
          },
        },
        attachments: {
          select: {
            mediaAsset: {
              select: {
                id: true,
                objectKey: true,
                bucket: true,
                mimeType: true,
              },
            },
          },
        },
      },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' }, // Fetch latest first to render backwards
    });

    return {
      data: messages,
      meta: {
        nextCursor:
          messages.length === take ? messages[messages.length - 1].id : null,
        count: messages.length,
      },
    };
  }

  async editMessage(userId: string, messageId: string, content: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderUserId !== userId)
      throw new ForbiddenException('Cannot edit others message');
    if (message.status === MessageStatus.DELETED)
      throw new BadRequestException('Cannot edit deleted message');

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content, status: MessageStatus.EDITED },
      select: { id: true, content: true },
    });

    this.messagesGateway.broadcastMessageUpdate(
      message.conversationId,
      messageId,
      content,
    );
    return updated;
  }

  async deleteMessage(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderUserId !== userId)
      throw new ForbiddenException('Cannot delete others message');

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), status: MessageStatus.DELETED },
    });

    this.messagesGateway.broadcastMessageDelete(
      message.conversationId,
      messageId,
    );
    return { message: 'Message deleted' };
  }
}
