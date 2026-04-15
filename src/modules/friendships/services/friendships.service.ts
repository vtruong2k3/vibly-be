import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { FriendRequestStatus } from '@prisma/client';
import { SendFriendRequestDto } from '../dto/send-friend-request.dto';
import { PresenceGateway } from '../../presence/gateways/presence.gateway';

@Injectable()
export class FriendshipsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PresenceGateway))
    private readonly presenceGateway: PresenceGateway,
  ) {}

  // POST /friends/request
  async sendRequest(requesterId: string, dto: SendFriendRequestDto) {
    if (requesterId === dto.addresseeId) {
      throw new BadRequestException(
        'You cannot send a friend request to yourself',
      );
    }

    // Check addressee exists
    const addressee = await this.prisma.user.findUnique({
      where: { id: dto.addresseeId, deletedAt: null },
    });
    if (!addressee) throw new NotFoundException('User not found');

    // Check if blocked in either direction
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: requesterId, blockedId: dto.addresseeId },
          { blockerId: dto.addresseeId, blockedId: requesterId },
        ],
      },
    });
    if (block) throw new ForbiddenException('Unable to send friend request');

    // Check already friends
    const friendship = await this.prisma.friendship.findUnique({
      where: {
        userId_friendId: { userId: requesterId, friendId: dto.addresseeId },
      },
    });
    if (friendship)
      throw new ConflictException('Already friends with this user');

    // Check existing pending request
    const existing = await this.prisma.friendRequest.findFirst({
      where: {
        requesterId,
        addresseeId: dto.addresseeId,
        status: FriendRequestStatus.PENDING,
      },
    });
    if (existing) throw new ConflictException('Friend request already sent');

    const request = await this.prisma.friendRequest.create({
      data: { requesterId, addresseeId: dto.addresseeId },
      select: {
        id: true,
        requesterId: true,
        addresseeId: true,
        status: true,
        createdAt: true,
        requester: {
          select: {
            username: true,
            profile: { select: { displayName: true, avatarMediaId: true } },
          },
        },
      },
    });

    // 🔔 Push real-time notification to the addressee
    this.presenceGateway.server
      ?.to(`user:${dto.addresseeId}`)
      .emit('notification', {
        type: 'friend_request_received',
        requestId: request.id,
        sender: {
          id: requesterId,
          username: request.requester.username,
          displayName: request.requester.profile?.displayName,
          avatarMediaId: request.requester.profile?.avatarMediaId,
        },
      });

    return request;
  }

  // POST /friends/:requestId/accept
  async acceptRequest(userId: string, requestId: string) {
    const request = await this.prisma.friendRequest.findFirst({
      where: {
        id: requestId,
        addresseeId: userId,
        status: FriendRequestStatus.PENDING,
      },
    });
    if (!request) throw new NotFoundException('Friend request not found');

    // Transaction: update request + create bi-directional friendship rows
    await this.prisma.$transaction(async (tx) => {
      await tx.friendRequest.update({
        where: { id: requestId },
        data: { status: FriendRequestStatus.ACCEPTED, respondedAt: new Date() },
      });

      // A→B and B→A both stored for O(1) lookup
      await tx.friendship.createMany({
        data: [
          { userId: request.requesterId, friendId: request.addresseeId },
          { userId: request.addresseeId, friendId: request.requesterId },
        ],
        skipDuplicates: true,
      });
    });

    // 🔔 Push real-time notification to the original requester
    this.presenceGateway.server
      ?.to(`user:${request.requesterId}`)
      .emit('notification', {
        type: 'friend_request_accepted',
        acceptedBy: {
          id: userId,
        },
      });

    return { message: 'Friend request accepted' };
  }

  // POST /friends/:requestId/reject
  async rejectRequest(userId: string, requestId: string) {
    const request = await this.prisma.friendRequest.findFirst({
      where: {
        id: requestId,
        addresseeId: userId,
        status: FriendRequestStatus.PENDING,
      },
    });
    if (!request) throw new NotFoundException('Friend request not found');

    await this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: FriendRequestStatus.REJECTED, respondedAt: new Date() },
    });

    return { message: 'Friend request rejected' };
  }

  // DELETE /friends/requests/:requestId  (Cancel an outgoing request)
  async cancelRequest(userId: string, requestId: string) {
    const request = await this.prisma.friendRequest.findFirst({
      where: {
        id: requestId,
        requesterId: userId,
        status: FriendRequestStatus.PENDING,
      },
    });
    if (!request) throw new NotFoundException('Pending friend request not found');

    await this.prisma.friendRequest.delete({
      where: { id: requestId },
    });

    return { message: 'Friend request canceled' };
  }

  // DELETE /friends/:userId
  async removeFriend(userId: string, friendId: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { userId_friendId: { userId, friendId } },
    });
    if (!friendship) throw new NotFoundException('Friendship not found');

    // Remove both directions
    await this.prisma.$transaction([
      this.prisma.friendship.deleteMany({
        where: {
          OR: [
            { userId, friendId },
            { userId: friendId, friendId: userId },
          ],
        },
      }),
    ]);

    return { message: 'Friend removed' };
  }

  // POST /blocks/:userId
  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('Cannot block yourself');
    }

    const blockedUser = await this.prisma.user.findUnique({
      where: { id: blockedId },
    });
    if (!blockedUser) throw new NotFoundException('User not found');

    const existing = await this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
    if (existing) throw new ConflictException('User is already blocked');

    // Block + remove friendship if exists
    await this.prisma.$transaction(async (tx) => {
      await tx.userBlock.create({ data: { blockerId, blockedId } });

      // Remove friendship in both directions if they were friends
      await tx.friendship.deleteMany({
        where: {
          OR: [
            { userId: blockerId, friendId: blockedId },
            { userId: blockedId, friendId: blockerId },
          ],
        },
      });

      // Cancel any pending friend requests
      await tx.friendRequest.updateMany({
        where: {
          status: FriendRequestStatus.PENDING,
          OR: [
            { requesterId: blockerId, addresseeId: blockedId },
            { requesterId: blockedId, addresseeId: blockerId },
          ],
        },
        data: { status: FriendRequestStatus.CANCELED },
      });
    });

    return { message: 'User blocked' };
  }

  // DELETE /blocks/:userId
  async unblockUser(blockerId: string, blockedId: string) {
    const block = await this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
    if (!block) throw new NotFoundException('Block not found');

    await this.prisma.userBlock.delete({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });

    return { message: 'User unblocked' };
  }

  // GET /friends — list friends with cursor pagination
  async listFriends(userId: string, cursor?: string, limit = 20) {
    const take = Math.min(limit, 50);

    const friendships = await this.prisma.friendship.findMany({
      where: { userId },
      include: {
        friend: {
          select: {
            id: true,
            username: true,
            profile: { select: { displayName: true, avatarMediaId: true } },
          },
        },
      },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: friendships.map((f) => ({
        friendshipId: f.id,
        user: f.friend,
        friendsSince: f.createdAt,
      })),
      meta: {
        nextCursor:
          friendships.length === take
            ? friendships[friendships.length - 1].id
            : null,
        count: friendships.length,
      },
    };
  }

  // GET /friends/requests — incoming pending requests
  async listIncomingRequests(userId: string) {
    return this.prisma.friendRequest.findMany({
      where: { addresseeId: userId, status: FriendRequestStatus.PENDING },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            profile: { select: { displayName: true, avatarMediaId: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // GET /friends/status/:targetId
  async getFriendshipStatus(userId: string, targetId: string) {
    if (userId === targetId) return { status: 'self', requestId: null };

    const friendship = await this.prisma.friendship.findUnique({
      where: { userId_friendId: { userId, friendId: targetId } },
    });
    if (friendship) return { status: 'friends', requestId: null };

    const request = await this.prisma.friendRequest.findFirst({
      where: {
        status: FriendRequestStatus.PENDING,
        OR: [
          { requesterId: userId, addresseeId: targetId },
          { requesterId: targetId, addresseeId: userId },
        ],
      },
    });

    if (!request) return { status: 'none', requestId: null };

    if (request.requesterId === userId) {
      return { status: 'pending_outgoing', requestId: request.id };
    } else {
      return { status: 'pending_incoming', requestId: request.id };
    }
  }
}
