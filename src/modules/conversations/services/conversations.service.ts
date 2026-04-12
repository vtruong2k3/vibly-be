import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ConversationType, ConversationMemberRole } from '@prisma/client';
import { CreateConversationDto } from 'src/modules/conversations/dto/create-conversation.dto';


@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createConversation(creatorId: string, dto: CreateConversationDto) {
    const allParticipantIds = [...new Set([...dto.participantIds, creatorId])];

    if (dto.type === ConversationType.DIRECT) {
      if (allParticipantIds.length !== 2) {
        throw new BadRequestException('Direct conversation must have exactly 2 participants');
      }
      
      // Check if DIRECT conversation already exists
      // In Prisma, we can find a conversation where both users are members and type is DIRECT
      const existing = await this.prisma.conversation.findFirst({
        where: {
          type: ConversationType.DIRECT,
          members: {
            every: {
              userId: { in: allParticipantIds }
            }
          }
        },
        include: { members: true }
      });
      // Additional precise check: Ensure it has exactly 2 members and exactly these 2 users
      if (existing && existing.members.length === 2) {
        return existing;
      }
    } else {
      // Group conversation
      if (allParticipantIds.length < 3) {
        throw new BadRequestException('Group conversation must have at least 3 participants');
      }
      if (!dto.name) {
        throw new BadRequestException('Group conversation must have a name');
      }
    }

    // Verify all users exist
    const users = await this.prisma.user.findMany({
      where: { id: { in: allParticipantIds }, deletedAt: null }
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
            role: userId === creatorId && dto.type === ConversationType.GROUP 
              ? ConversationMemberRole.ADMIN 
              : ConversationMemberRole.MEMBER
          }))
        }
      },
      include: {
        members: {
          select: {
            userId: true, role: true, 
            user: { select: { username: true, profile: { select: { displayName: true, avatarMediaId: true } } } }
          }
        }
      }
    });
  }

  async getConversations(userId: string) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            // Need to fetch other members to display conversation names for DIRECT chats
            members: {
              select: {
                userId: true, 
                user: { select: { username: true, profile: { select: { displayName: true, avatarMediaId: true } } } }
              }
            },
            // Load the last message for the inbox preview
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { id: true, content: true, messageType: true, createdAt: true, senderUserId: true }
            }
          }
        }
      },
      orderBy: { conversation: { updatedAt: 'desc' } }
    });

    return memberships.map(m => {
      const conv = m.conversation;
      return {
        id: conv.id,
        type: conv.type,
        
        
        unreadCount: m.unreadCount,
        lastReadAt: m.lastReadAt,
        messages: conv.messages,
        members: conv.members.filter(mem => mem.userId !== userId), // Excluding self from preview list
        updatedAt: conv.updatedAt
      };
    });
  }

  async markAsRead(userId: string, conversationId: string) {
    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } }
    });

    if (!membership) throw new NotFoundException('Conversation membership not found');

    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { unreadCount: 0, lastReadAt: new Date() }
    });

    return { message: 'Conversation marked as read' };
  }
}
