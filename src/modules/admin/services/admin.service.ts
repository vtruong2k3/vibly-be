import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { UserStatus, UserRole } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // GET /admin/users — Paginated user list with filters
  async getUsers(params: {
    cursor?: string;
    limit?: number;
    status?: UserStatus;
    role?: UserRole;
    search?: string;
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
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        lastLoginAt: true,
        _count: { select: { posts: true } },
      },
      take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: users,
      meta: { nextCursor: users.length === take ? users[users.length - 1].id : null },
    };
  }

  // PATCH /admin/users/:id/role — Promote user to MODERATOR or back to USER
  async updateUserRole(adminId: string, targetUserId: string, role: UserRole) {
    const user = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role },
      select: { id: true, username: true, role: true },
    });

    await this.writeAuditLog(adminId, 'UPDATE_USER_ROLE', 'USER', targetUserId, { newRole: role });
    return user;
  }

  // PATCH /admin/users/:id/status — Suspend or reactivate user
  async updateUserStatus(adminId: string, targetUserId: string, status: UserStatus) {
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: { status },
        select: { id: true, username: true, status: true },
      });

      // Revoke all sessions when suspending
      if (status === UserStatus.SUSPENDED) {
        await tx.session.updateMany({
          where: { userId: targetUserId, revokedAt: null },
          data: { revokedAt: new Date(), revokeReason: 'admin_suspended' },
        });
      }

      return updated;
    });

    await this.writeAuditLog(adminId, 'UPDATE_USER_STATUS', 'USER', targetUserId, { newStatus: status });
    return user;
  }

  // GET /admin/audit-logs — Immutable audit trail
  async getAuditLogs(cursor?: string, limit = 50) {
    const take = Math.min(limit, 100);
    const logs = await this.prisma.adminAuditLog.findMany({
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { username: true, role: true } },
      },
    });

    return {
      data: logs,
      meta: { nextCursor: logs.length === take ? logs[logs.length - 1].id : null },
    };
  }

  // GET /admin/stats — Platform stats dashboard
  async getStats() {
    const [totalUsers, activeUsers, totalPosts, openReports] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.post.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
      this.prisma.report.count({ where: { status: 'OPEN' } }),
    ]);

    return { totalUsers, activeUsers, totalPosts, openReports };
  }

  // ── Private: Write an admin audit log entry ─────────────────────────────────
  async writeAuditLog(
    actorUserId: string,
    action: string,
    entityType: string,
    entityId?: string,
    payload?: object,
  ) {
    await this.prisma.adminAuditLog.create({
      data: { actorUserId, action, entityType, entityId, payload },
    });
  }
}
