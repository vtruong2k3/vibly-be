import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AdminAuditService } from '../audit-log/admin-audit.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class AdminReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AdminAuditService,
  ) {}

  // List reports — cursor paginated with filters
  async getReports(params: {
    status?: string;
    severity?: string;
    targetType?: string;
    moderatorId?: string;
    assignedToMe?: boolean;
    actorId?: string;
    cursor?: string;
    limit?: number;
  }) {
    const take = Math.min(params.limit ?? 30, 100);

    const reports = await this.prisma.report.findMany({
      where: {
        ...(params.status && { status: params.status as any }),
        ...(params.severity && { severity: params.severity as any }),
        ...(params.targetType && { targetType: params.targetType as any }),
        ...(params.moderatorId && { moderatorId: params.moderatorId }),
        ...(params.assignedToMe &&
          params.actorId && { moderatorId: params.actorId }),
      },
      take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
      include: {
        reporter: { select: { id: true, username: true } },
        moderator: { select: { id: true, username: true } },
        resolvedBy: { select: { id: true, username: true } },
      },
    });

    return {
      data: reports,
      meta: {
        nextCursor: reports.length === take ? reports[reports.length - 1].id : null,
      },
    };
  }

  // Get single report detail
  async getReportDetail(reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reporter: { select: { id: true, username: true } },
        moderator: { select: { id: true, username: true } },
        resolvedBy: { select: { id: true, username: true } },
        moderationActions: {
          include: { moderator: { select: { username: true, role: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!report) throw new NotFoundException('Report not found');

    return report;
  }

  // Claim report for review
  async markReviewing(actorId: string, reportId: string, ip?: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) throw new NotFoundException('Report not found');

    if (report.status !== 'OPEN') {
      throw new BadRequestException(
        `Report is already in status: ${report.status}`,
      );
    }

    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: { status: 'REVIEWING', moderatorId: actorId },
    });

    await this.auditService.write(
      actorId,
      'REPORT_REVIEWING',
      'REPORT',
      reportId,
      {},
      ip,
    );

    return updated;
  }

  // Resolve report with a note
  async resolve(
    actorId: string,
    reportId: string,
    resolveNote: string,
    ip?: string,
  ) {
    if (!resolveNote?.trim()) {
      throw new BadRequestException('A resolve note is required');
    }

    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedByUserId: actorId,
        resolveNote,
      },
    });

    await this.auditService.write(
      actorId,
      'REPORT_RESOLVED',
      'REPORT',
      reportId,
      { resolveNote },
      ip,
      undefined,
      resolveNote,
    );

    return updated;
  }

  // Dismiss report — ADMIN only
  async dismiss(
    actorId: string,
    actorRole: string,
    reportId: string,
    reason: string,
    ip?: string,
  ) {
    if (actorRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only ADMIN can dismiss reports');
    }

    if (!reason?.trim()) {
      throw new BadRequestException('A reason is required to dismiss a report');
    }

    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'REJECTED',
        resolvedAt: new Date(),
        resolvedByUserId: actorId,
        resolveNote: reason,
      },
    });

    await this.auditService.write(
      actorId,
      'REPORT_DISMISSED',
      'REPORT',
      reportId,
      {},
      ip,
      undefined,
      reason,
    );

    return updated;
  }

  // Escalate severity — ADMIN only
  async escalate(
    actorId: string,
    actorRole: string,
    reportId: string,
    severity: string,
    ip?: string,
  ) {
    if (actorRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only ADMIN can escalate report severity');
    }

    const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    if (!validSeverities.includes(severity)) {
      throw new BadRequestException(
        `Invalid severity. Must be one of: ${validSeverities.join(', ')}`,
      );
    }

    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: { severity: severity as any },
    });

    await this.auditService.write(
      actorId,
      'REPORT_ESCALATED',
      'REPORT',
      reportId,
      { severity },
      ip,
    );

    return updated;
  }
}
