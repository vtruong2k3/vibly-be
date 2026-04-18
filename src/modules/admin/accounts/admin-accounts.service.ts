import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AdminAuditService } from '../audit-log/admin-audit.service';
import { UserRole, UserStatus } from '@prisma/client';

@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AdminAuditService,
  ) {}

  // List all admin/mod accounts — ADMIN only
  async getAccounts(params: {
    role?: UserRole;
    search?: string;
    cursor?: string;
    limit?: number;
  }) {
    const take = Math.min(params.limit ?? 50, 100);

    const accounts = await this.prisma.user.findMany({
      where: {
        role: params.role ?? { in: [UserRole.ADMIN, UserRole.MODERATOR] },
        deletedAt: null,
        ...(params.search && {
          OR: [
            { username: { contains: params.search, mode: 'insensitive' } },
            { email: { contains: params.search, mode: 'insensitive' } },
          ],
        }),
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        totpEnabled: true,
        lastLoginAt: true,
        createdAt: true,
      },
      take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: accounts,
      meta: {
        nextCursor: accounts.length === take ? accounts[accounts.length - 1].id : null,
      },
    };
  }

  // Get single admin/mod detail with last 20 audit actions they performed
  async getAccountDetail(accountId: string) {
    const account = await this.prisma.user.findFirst({
      where: {
        id: accountId,
        role: { in: [UserRole.ADMIN, UserRole.MODERATOR] },
        deletedAt: null,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        totpEnabled: true,
        totpVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!account) throw new NotFoundException('Admin/Moderator account not found');

    const recentActions = await this.prisma.adminAuditLog.findMany({
      where: { actorUserId: accountId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        reason: true,
        createdAt: true,
      },
    });

    return { ...account, recentActions };
  }

  // Change role of a mod account — ADMIN only, cannot self-edit, cannot touch another ADMIN
  async updateRole(
    actorId: string,
    targetId: string,
    newRole: UserRole,
    ip?: string,
  ) {
    if (actorId === targetId) {
      throw new ForbiddenException('Cannot change your own role');
    }

    // Only USER → MODERATOR or MODERATOR → USER transitions allowed via API
    if (newRole === UserRole.ADMIN) {
      throw new ForbiddenException('Cannot promote to ADMIN via API');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { role: true, username: true },
    });

    if (!target) throw new NotFoundException('Account not found');

    // Cannot demote another ADMIN
    if (target.role === UserRole.ADMIN) {
      throw new ForbiddenException('Cannot demote another ADMIN account via API');
    }

    await this.prisma.user.update({
      where: { id: targetId },
      data: { role: newRole },
    });

    await this.auditService.write(
      actorId,
      'ADMIN_ACCOUNT_ROLE_CHANGED',
      'USER',
      targetId,
      { from: target.role, to: newRole },
      ip,
    );

    return { id: targetId, role: newRole };
  }

  // Suspend/activate an admin/mod account — ADMIN only
  async updateStatus(
    actorId: string,
    targetId: string,
    status: UserStatus,
    reason?: string,
    ip?: string,
  ) {
    if (actorId === targetId) {
      throw new ForbiddenException('Cannot change your own status');
    }

    const target = await this.prisma.user.findFirst({
      where: {
        id: targetId,
        role: { in: [UserRole.ADMIN, UserRole.MODERATOR] },
      },
      select: { role: true },
    });

    if (!target) throw new NotFoundException('Admin/Moderator account not found');

    // Cannot affect another ADMIN's status
    if (target.role === UserRole.ADMIN) {
      throw new ForbiddenException('Cannot change status of another ADMIN account');
    }

    await this.prisma.user.update({
      where: { id: targetId },
      data: { status },
    });

    await this.auditService.write(
      actorId,
      `ADMIN_ACCOUNT_STATUS_${status}`,
      'USER',
      targetId,
      { status },
      ip,
      undefined,
      reason,
    );

    return { id: targetId, status };
  }

  // Summary stats for admin dashboard header
  async getStats() {
    const [totalAdmins, totalMods, totalWithTotp] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.ADMIN, deletedAt: null } }),
      this.prisma.user.count({ where: { role: UserRole.MODERATOR, deletedAt: null } }),
      this.prisma.user.count({
        where: {
          role: { in: [UserRole.ADMIN, UserRole.MODERATOR] },
          totpEnabled: true,
          deletedAt: null,
        },
      }),
    ]);

    return { totalAdmins, totalMods, totalWithTotp };
  }
}
