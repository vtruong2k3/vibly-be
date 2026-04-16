import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ConversationType, ConversationMemberRole } from '@prisma/client';
import { CreateConversationDto } from 'src/modules/conversations/dto/create-conversation.dto';
import { PresenceService } from '../../presence/services/presence.service';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenceService: PresenceService,
  ) {}

  async createConversation(creatorId: string, dto: CreateConversationDto) {
    const allParticipantIds = [...new Set([...dto.participantIds, creatorId])];

    if (dto.type === ConversationType.DIRECT) {
      if (allParticipantIds.length !== 2) {
        throw new BadRequestException(
          'Direct conversation must have exactly 2 participants',
        );
      }

      // Check if DIRECT conversation already exists
      const existing = await this.prisma.conversation.findFirst({
        where: {
          type: ConversationType.DIRECT,
          members: {
            every: {
              userId: { in: allParticipantIds },
            },
          },
        },
        include: { members: true },
      });
      // Additional precise check: Ensure it has exactly 2 members and exactly these 2 users
      if (existing && existing.members.length === 2) {
        return existing;
      }
    } else {
      // Group conversation
      if (allParticipantIds.length < 3) {
        throw new BadRequestException(
          'Group conversation must have at least 3 participants',
        );
      }
      if (!dto.name) {
        throw new BadRequestException('Group conversation must have a name');
      }
    }

    // Verify all users exist
    const users = await this.prisma.user.findMany({
      where: { id: { in: allParticipantIds }, deletedAt: null },
    });
    if (users.length !== allParticipantIds.length) {
      throw new BadRequestException('One or more participant users not found');
    }

    // Create conversation & members transactionally
    return this.prisma.conversation.create({
      data: {
        type: dto.type,
        members: {
          create: allParticipantIds.map((userId) => ({
            userId,
            role:
              userId === creatorId && dto.type === ConversationType.GROUP
                ? ConversationMemberRole.ADMIN
                : ConversationMemberRole.MEMBER,
          })),
        },
      },
      include: {
        members: {
          select: {
            userId: true,
            role: true,
            user: {
              select: {
                id: true,
                username: true,
                profile: { select: { displayName: true, avatarMediaId: true } },
              },
            },
          },
        },
      },
    });
  }

  async getConversations(userId: string) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            members: {
              select: {
                userId: true,
                user: {
                  select: {
                    id: true,
                    username: true,
                    profile: {
                      select: { displayName: true, avatarMediaId: true },
                    },
                  },
                },
              },
            },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                content: true,
                messageType: true,
                createdAt: true,
                senderUserId: true,
              },
            },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    // Collect all other-participant user IDs
    const otherUserIds = memberships
      .map((m) => m.conversation.members.find((mem) => mem.userId !== userId)?.userId)
      .filter(Boolean) as string[];

    // Batch fetch presence + friendships in parallel
    const [presenceMap, friendships] = await Promise.all([
      this.presenceService.getPresenceBulk(otherUserIds),
      this.prisma.friendship.findMany({
        where: { userId, friendId: { in: otherUserIds } },
        select: { friendId: true },
      }),
    ]);

    const friendSet = new Set(friendships.map((f) => f.friendId));

    return memberships.map((m) => {
      const conv = m.conversation;
      const otherMember = conv.members.find((mem) => mem.userId !== userId);
      const otherUserId = otherMember?.userId;
      const isRequest = !!otherUserId && !friendSet.has(otherUserId);
      const presence = otherUserId ? presenceMap[otherUserId] : null;

      return {
        id: conv.id,
        type: conv.type,
        isRequest,
        unreadCount: m.unreadCount,
        lastReadAt: m.lastReadAt,
        messages: conv.messages,
        members: conv.members
          .filter((mem) => mem.userId !== userId)
          .map((mem) => ({
            ...mem,
            user: {
              ...mem.user,
              presence: presenceMap[mem.userId] ?? { isOnline: false, lastSeenAt: null },
            },
          })),
        updatedAt: conv.updatedAt,
      };
    });
  }

  async markAsRead(userId: string, conversationId: string) {
    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!membership)
      throw new NotFoundException('Conversation membership not found');

    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { unreadCount: 0, lastReadAt: new Date() },
    });

    return { message: 'Conversation marked as read' };
  }
}
