import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  // Write a structured audit log entry after every admin mutation
  async write(
    actorUserId: string,
    action: string,
    entityType: string,
    entityId?: string,
    payload?: object,
    ip?: string,
    userAgent?: string,
    reason?: string,
  ): Promise<void> {
    await this.prisma.adminAuditLog.create({
      data: {
        actorUserId,
        action,
        entityType,
        entityId,
        payload: payload as any,
        ip,
        userAgent,
        reason,
      },
    });
  }

  // GET /admin/audit-logs — cursor paginated, multi-filter
  async getLogs(params: {
    cursor?: string;
    limit?: number;
    actorId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }) {
    const take = Math.min(params.limit ?? 50, 100);

    const logs = await this.prisma.adminAuditLog.findMany({
      take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      where: {
        ...(params.actorId && { actorUserId: params.actorId }),
        ...(params.action && {
          action: { contains: params.action, mode: 'insensitive' },
        }),
        ...(params.entityType && { entityType: params.entityType }),
        ...(params.entityId && { entityId: params.entityId }),
        ...((params.dateFrom || params.dateTo) && {
          createdAt: {
            ...(params.dateFrom && { gte: params.dateFrom }),
            ...(params.dateTo && { lte: params.dateTo }),
          },
        }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, username: true, email: true, role: true } },
      },
    });

    return {
      data: logs,
      meta: {
        nextCursor: logs.length === take ? logs[logs.length - 1].id : null,
      },
    };
  }
}
