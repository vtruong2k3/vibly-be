import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { CreateReportDto } from '../dto/create-report.dto';
import { ModerationActionDto } from '../dto/moderation-action.dto';
import {
  ModerationActionType,
  ReportStatus,
  UserStatus,
  PostStatus,
  CommentStatus,
} from '@prisma/client';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // POST /moderation/report — Any user can report
  async createReport(reporterUserId: string, dto: CreateReportDto) {
    // Prevent duplicate reports on same entity by same user
    const existing = await this.prisma.report.findFirst({
      where: {
        reporterUserId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        status: { in: ['OPEN', 'REVIEWING'] },
      },
    });
    if (existing) {
      throw new BadRequestException(
        'You already have an active report on this entity',
      );
    }

    const report = await this.prisma.report.create({
      data: {
        reporterUserId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reasonCode: dto.reasonCode,
        reasonText: dto.reasonText,
      },
    });

    this.logger.log(
      `Report ${report.id} created by ${reporterUserId} on ${dto.targetType}:${dto.targetId}`,
    );
    return report;
  }

  // GET /moderation/reports — Moderator view
  async getReports(status?: string, cursor?: string, limit = 50) {
    const take = Math.min(limit, 100);
    const reports = await this.prisma.report.findMany({
      where: status ? { status: status as ReportStatus } : {},
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { username: true } },
        moderationActions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    return {
      data: reports,
      meta: {
        nextCursor:
          reports.length === take ? reports[reports.length - 1].id : null,
      },
    };
  }

  // POST /moderation/action — Moderator takes action
  async takeAction(moderatorUserId: string, dto: ModerationActionDto) {
    const action = await this.prisma.$transaction(async (tx) => {
      const moderationAction = await tx.moderationAction.create({
        data: {
          reportId: dto.reportId,
          moderatorUserId,
          targetType: dto.targetType,
          targetId: dto.targetId,
          actionType: dto.actionType,
          note: dto.note,
        },
      });

      // Perform the actual action (apply effect to DB)
      await this.applyAction(tx, dto.actionType, dto.targetType, dto.targetId);

      // Resolve report if provided
      if (dto.reportId) {
        await tx.report.update({
          where: { id: dto.reportId },
          data: { status: ReportStatus.RESOLVED },
        });
      }

      return moderationAction;
    });

    this.logger.log(
      `Moderator ${moderatorUserId} applied ${dto.actionType} on ${dto.targetType}:${dto.targetId}`,
    );
    return action;
  }

  // ── Private: Apply the effect of a moderation action ───────────────────────
  private async applyAction(
    tx: any,
    actionType: ModerationActionType,
    targetType: string,
    targetId: string,
  ) {
    switch (actionType) {
      case ModerationActionType.HIDE_POST:
        await tx.post.update({
          where: { id: targetId },
          data: { status: PostStatus.HIDDEN },
        });
        break;

      case ModerationActionType.DELETE_COMMENT:
        await tx.comment.update({
          where: { id: targetId },
          data: { status: CommentStatus.DELETED, deletedAt: new Date() },
        });
        break;

      case ModerationActionType.DELETE_MESSAGE:
        await tx.message.update({
          where: { id: targetId },
          data: { deletedAt: new Date() },
        });
        break;

      case ModerationActionType.SUSPEND_USER:
        await tx.user.update({
          where: { id: targetId },
          data: { status: UserStatus.SUSPENDED },
        });
        // Revoke all sessions of the suspended user
        await tx.session.updateMany({
          where: { userId: targetId, revokedAt: null },
          data: { revokedAt: new Date(), revokeReason: 'account_suspended' },
        });
        break;

      case ModerationActionType.WARN_USER:
        // Warning only — logged, user stays active (push notification could be added)
        break;

      case ModerationActionType.RESTORE:
        // Restore a hidden post or reactivate a user
        if (targetType === 'POST') {
          await tx.post.update({
            where: { id: targetId },
            data: { status: PostStatus.PUBLISHED },
          });
        } else if (targetType === 'USER') {
          await tx.user.update({
            where: { id: targetId },
            data: { status: UserStatus.ACTIVE },
          });
        }
        break;
    }
  }
}
