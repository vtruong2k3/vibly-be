import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AdminAuditService } from '../audit-log/admin-audit.service';
import { RevokerService } from '../revoker/revoker.service';
import { UserStatus, UserRole } from '@prisma/client';

const STATUS_REQUIRES_REASON: UserStatus[] = [
  UserStatus.SUSPENDED,
  UserStatus.BANNED,
];

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AdminAuditService,
    private readonly revokerService: RevokerService,
  ) {}

  // List users with filters + cursor pagination
  async getUsers(params: {
    status?: UserStatus;
    role?: UserRole;
    search?: string;
    cursor?: string;
    limit?: number;
    createdFrom?: string;
    createdTo?: string;
    sortBy?: string;
  }) {
    const take = Math.min(params.limit ?? 50, 100);

    const users = await this.prisma.user.findMany({
      where: {
        ...(params.status && { status: params.status }),
        ...(params.role && { role: params.role }),
        ...(params.search && {
          OR: [
            { username: { contains: params.search, mode: 'insensitive' } },
            { email: { contains: params.search, mode: 'insensitive' } },
          ],
        }),
        ...((params.createdFrom || params.createdTo) && {
          createdAt: {
            ...(params.createdFrom && { gte: new Date(params.createdFrom) }),
            ...(params.createdTo && { lte: new Date(params.createdTo) }),
          },
        }),
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        _count: { select: { posts: true, reportsFiled: true } },
      },
      take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: this.resolveOrderBy(params.sortBy),
    });

    return {
      data: users,
      meta: {
        nextCursor: users.length === take ? users[users.length - 1].id : null,
      },
    };
  }

  // Single user with moderation history
  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        totpEnabled: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        _count: {
          select: { posts: true, comments: true, reportsFiled: true },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const moderationHistory = await this.prisma.adminAuditLog.findMany({
      where: { entityType: 'USER', entityId: userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { actor: { select: { username: true, role: true } } },
    });

    return { ...user, moderationHistory };
  }

  // Suspend / ban / activate user
  async updateUserStatus(
    actorId: string,
    actorRole: string,
    targetUserId: string,
    status: UserStatus,
    reason?: string,
    ip?: string,
  ) {
    if (actorId === targetUserId) {
      throw new ForbiddenException('Cannot change your own status');
    }

    // Only ADMIN can permanently ban
    if (status === UserStatus.BANNED && actorRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only ADMIN can permanently ban users');
    }

    // Reason is mandatory for destructive actions
    if (STATUS_REQUIRES_REASON.includes(status) && !reason?.trim()) {
      throw new BadRequestException(
        'A reason is required for SUSPENDED and BANNED actions',
      );
    }

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { status },
    });

    // Force-logout immediately on suspension/ban
    if (status === UserStatus.SUSPENDED || status === UserStatus.BANNED) {
      await this.revokerService.revokeUser(
        targetUserId,
        `admin_${status.toLowerCase()}`,
      );
    }

    await this.auditService.write(
      actorId,
      `USER_STATUS_${status}`,
      'USER',
      targetUserId,
      { status },
      ip,
      undefined,
      reason,
    );

    return { id: targetUserId, status };
  }

  // Change user role — ADMIN only
  async updateUserRole(
    actorId: string,
    actorRole: string,
    targetUserId: string,
    newRole: UserRole,
    ip?: string,
  ) {
    if (actorRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only ADMIN can change user roles');
    }

    if (actorId === targetUserId) {
      throw new ForbiddenException('Cannot change your own role');
    }

    // Cannot promote to ADMIN via API (only seeded)
    if (newRole === UserRole.ADMIN) {
      throw new ForbiddenException(
        'Cannot promote to ADMIN via API — use database seed',
      );
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { role: true },
    });

    if (!target) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
    });

    await this.auditService.write(
      actorId,
      'USER_ROLE_CHANGED',
      'USER',
      targetUserId,
      { from: target.role, to: newRole },
      ip,
    );

    return { id: targetUserId, role: newRole };
  }

  // Bulk status update — ADMIN only
  async bulkAction(
    actorId: string,
    actorRole: string,
    userIds: string[],
    action: 'SUSPEND' | 'ACTIVATE' | 'BAN',
    reason: string,
    ip?: string,
  ) {
    if (actorRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only ADMIN can perform bulk actions');
    }

    const statusMap: Record<string, UserStatus> = {
      SUSPEND: UserStatus.SUSPENDED,
      ACTIVATE: UserStatus.ACTIVE,
      BAN: UserStatus.BANNED,
    };

    const newStatus = statusMap[action];

    await this.prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { status: newStatus },
    });

    // Revoke sessions for destructive bulk actions
    if (action === 'BAN' || action === 'SUSPEND') {
      await Promise.all(
        userIds.map((id) =>
          this.revokerService.revokeUser(id, `bulk_${action.toLowerCase()}`),
        ),
      );
    }

    await this.auditService.write(
      actorId,
      `BULK_USER_${action}`,
      'USER',
      undefined,
      { userIds, count: userIds.length },
      ip,
      undefined,
      reason,
    );

    return { affected: userIds.length, status: newStatus };
  }

  private resolveOrderBy(sortBy?: string) {
    const map: Record<string, object> = {
      createdAt: { createdAt: 'desc' },
      lastLoginAt: { lastLoginAt: 'desc' },
      postCount: { posts: { _count: 'desc' } },
    };
    return map[sortBy ?? 'createdAt'] ?? { createdAt: 'desc' };
  }
}
