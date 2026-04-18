import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { differenceInDays, endOfDay, startOfDay, subDays } from 'date-fns';

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private getDateRange(from?: string, to?: string) {
    const end = to ? endOfDay(new Date(to)) : endOfDay(new Date());
    const start = from ? startOfDay(new Date(from)) : startOfDay(subDays(end, 29));
    const diff = differenceInDays(end, start);
    
    // Previous period of exactly 'diff' days, ending just before 'start'
    const prevEnd = endOfDay(subDays(start, 1));
    const prevStart = startOfDay(subDays(prevEnd, diff));
    
    return { start, end, prevStart, prevEnd };
  }

  // Dashboard overview
  async getOverview(from?: string, to?: string) {
    const { start, end, prevStart, prevEnd } = this.getDateRange(from, to);

    const [
      totalUsers, activeUsers, suspendedUsers, bannedUsers,
      pendingReports, criticalReports,
      
      newUsersPeriod, newUsersPrev,
      newPostsPeriod, newPostsPrev,
      newCommentsPeriod, newCommentsPrev,
    ] = await Promise.all([
      // Absolute totals (ignore date filter)
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.user.count({ where: { status: 'BANNED' } }),
      this.prisma.report.count({ where: { status: 'OPEN' } }),
      this.prisma.report.count({ where: { status: 'OPEN', severity: 'CRITICAL' } }),
      
      // Relative periods
      this.prisma.user.count({ where: { createdAt: { gte: start, lte: end } } }),
      this.prisma.user.count({ where: { createdAt: { gte: prevStart, lte: prevEnd } } }),
      
      this.prisma.post.count({ where: { createdAt: { gte: start, lte: end }, deletedAt: null } }),
      this.prisma.post.count({ where: { createdAt: { gte: prevStart, lte: prevEnd }, deletedAt: null } }),
      
      this.prisma.comment.count({ where: { createdAt: { gte: start, lte: end }, deletedAt: null } }),
      this.prisma.comment.count({ where: { createdAt: { gte: prevStart, lte: prevEnd }, deletedAt: null } }),
    ]);

    const calcDelta = (current: number, prev: number) =>
      prev === 0 ? (current > 0 ? 100 : 0) : Math.round(((current - prev) / prev) * 100);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        banned: bannedUsers,
        newToday: newUsersPeriod, // Kept key name for frontend compatibility
        deltaNewUsers: calcDelta(newUsersPeriod, newUsersPrev),
      },
      content: {
        postsToday: newPostsPeriod, // Kept key name for frontend compatibility
        commentsToday: newCommentsPeriod,
        deltaPosts: calcDelta(newPostsPeriod, newPostsPrev),
        deltaComments: calcDelta(newCommentsPeriod, newCommentsPrev),
      },
      reports: {
        pending: pendingReports,
        critical: criticalReports,
      },
      rangeContext: { start, end, prevStart, prevEnd }, // Useful for debugging/display
    };
  }

  // Registration trend
  async getRegistrationTrend(from?: string, to?: string) {
    const { start, end } = this.getDateRange(from, to);

    const result = await this.prisma.$queryRaw<
      { date: string; count: bigint }[]
    >`
      SELECT
        DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')::date::text AS date,
        COUNT(*)::int AS count
      FROM users
      WHERE created_at >= ${start} AND created_at <= ${end}
        AND deleted_at IS NULL
      GROUP BY 1
      ORDER BY 1
    `;

    return result.map((r) => ({ date: r.date, count: Number(r.count) }));
  }

  // Content volume trend
  async getContentTrend(from?: string, to?: string) {
    const { start, end } = this.getDateRange(from, to);

    const [posts, comments] = await Promise.all([
      this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT
          DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')::date::text AS date,
          COUNT(*)::int AS count
        FROM posts
        WHERE created_at >= ${start} AND created_at <= ${end} AND deleted_at IS NULL
        GROUP BY 1 ORDER BY 1
      `,
      this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT
          DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')::date::text AS date,
          COUNT(*)::int AS count
        FROM comments
        WHERE created_at >= ${start} AND created_at <= ${end} AND deleted_at IS NULL
        GROUP BY 1 ORDER BY 1
      `,
    ]);

    return {
      posts: posts.map((r) => ({ date: r.date, count: Number(r.count) })),
      comments: comments.map((r) => ({ date: r.date, count: Number(r.count) })),
    };
  }

  // Report breakdown by category
  async getReportBreakdown(from?: string, to?: string) {
    const { start, end } = this.getDateRange(from, to);

    const breakdown = await this.prisma.report.groupBy({
      by: ['reasonCode', 'status'],
      where: {
        createdAt: { gte: start, lte: end },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    return breakdown.map((r) => ({
      reasonCode: r.reasonCode,
      status: r.status,
      count: r._count.id,
    }));
  }
}
