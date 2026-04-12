import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { UserStatus } from '@prisma/client';
import { UpdateUserDto } from '../dto/update-user.dto';
import { SearchUsersDto } from '../dto/search-users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // GET /me — current authenticated user with profile
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        profile: {
          select: {
            displayName: true,
            bio: true,
            gender: true,
            birthday: true,
            hometown: true,
            currentCity: true,
            website: true,
            avatarMediaId: true,
            coverMediaId: true,
          },
        },
        privacySettings: true,
        notificationSettings: true,
        securitySettings: {
          select: { twoFactorEnabled: true, passwordChangedAt: true },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // PATCH /me — update username
  async updateMe(userId: string, dto: UpdateUserDto) {
    if (dto.username) {
      const exists = await this.prisma.user.findFirst({
        where: {
          username: dto.username.toLowerCase(),
          NOT: { id: userId },
          deletedAt: null,
        },
      });
      if (exists) throw new ConflictException('Username is already taken');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.username && { username: dto.username.toLowerCase() }),
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        updatedAt: true,
      },
    });
  }

  // GET /users/:id — public user profile (respects privacy settings)
  async getUserById(requestingUserId: string, targetUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId, status: UserStatus.ACTIVE, deletedAt: null },
      select: {
        id: true,
        username: true,
        createdAt: true,
        profile: {
          select: {
            displayName: true,
            bio: true,
            hometown: true,
            currentCity: true,
            website: true,
            avatarMediaId: true,
            coverMediaId: true,
          },
        },
        privacySettings: {
          select: {
            profileVisibility: true,
            friendListVisibility: true,
            showOnlineStatus: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    // Check if requester is blocked by or has blocked the target
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: requestingUserId, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: requestingUserId },
        ],
      },
    });

    if (block) throw new ForbiddenException('User not accessible');

    return user;
  }

  // GET /users/search?q= — search users by username/displayName
  async searchUsers(requestingUserId: string, dto: SearchUsersDto) {
    const limit = Math.min(dto.limit ?? 20, 50);
    const query = dto.q?.trim();

    if (!query || query.length < 2) return { data: [], meta: { total: 0 } };

    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: UserStatus.ACTIVE,
        NOT: { id: requestingUserId },
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          {
            profile: { displayName: { contains: query, mode: 'insensitive' } },
          },
        ],
      },
      select: {
        id: true,
        username: true,
        profile: {
          select: { displayName: true, avatarMediaId: true },
        },
      },
      take: limit,
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'asc' },
    });

    return {
      data: users,
      meta: {
        nextCursor: users.length === limit ? users[users.length - 1].id : null,
        count: users.length,
      },
    };
  }

  // GET /users/:id/sessions — list active sessions for current user
  async getMySessions(userId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        deviceName: true,
        deviceOs: true,
        browser: true,
        ipCreated: true,
        ipLastUsed: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });

    return sessions;
  }
}
