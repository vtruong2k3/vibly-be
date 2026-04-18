import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { startOfDay, subDays } from 'date-fns';

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // Dashboard overview — 8 KPIs with day-over-day deltas
  async getOverview() {
    const now = new Date();
    const todayStart = startOfDay(now);
    const yesterdayStart = startOfDay(subDays(now, 1));

    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      bannedUsers,
      newUsersToday,
      newUsersYesterday,
      totalPostsToday,
      totalPostsYesterday,
      totalCommentsToday,
      totalCommentsYesterday,
      pendingReports,
      criticalReports,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.user.count({ where: { status: 'BANNED' } }),
      this.prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.user.count({
        where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
      }),
      this.prisma.post.count({
        where: { createdAt: { gte: todayStart }, deletedAt: null },
      }),
      this.prisma.post.count({
        where: { createdAt: { gte: yesterdayStart, lt: todayStart }, deletedAt: null },
      }),
      this.prisma.comment.count({
        where: { createdAt: { gte: todayStart }, deletedAt: null },
      }),
      this.prisma.comment.count({
        where: { createdAt: { gte: yesterdayStart, lt: todayStart }, deletedAt: null },
      }),
      this.prisma.report.count({ where: { status: 'OPEN' } }),
      this.prisma.report.count({
        where: { status: 'OPEN', severity: 'CRITICAL' },
      }),
    ]);

    const calcDelta = (today: number, yesterday: number) =>
      yesterday === 0
        ? today > 0 ? 100 : 0
        : Math.round(((today - yesterday) / yesterday) * 100);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        banned: bannedUsers,
        newToday: newUsersToday,
        deltaNewUsers: calcDelta(newUsersToday, newUsersYesterday),
      },
      content: {
        postsToday: totalPostsToday,
        commentsToday: totalCommentsToday,
        deltaPosts: calcDelta(totalPostsToday, totalPostsYesterday),
        deltaComments: calcDelta(totalCommentsToday, totalCommentsYesterday),
      },
      reports: {
        pending: pendingReports,
        critical: criticalReports,
      },
    };
  }

  // Registration trend — last N days
  async getRegistrationTrend(days: number = 30) {
    const from = startOfDay(subDays(new Date(), days - 1));

    const result = await this.prisma.$queryRaw<
      { date: string; count: bigint }[]
    >`
      SELECT
        DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')::date::text AS date,
        COUNT(*)::int AS count
      FROM users
      WHERE created_at >= ${from}
        AND deleted_at IS NULL
      GROUP BY 1
      ORDER BY 1
    `;

    return result.map((r) => ({
      date: r.date,
      count: Number(r.count),
    }));
  }

  // Content volume trend — last N days
  async getContentTrend(days: number = 30) {
    const from = startOfDay(subDays(new Date(), days - 1));

    const [posts, comments] = await Promise.all([
      this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT
          DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')::date::text AS date,
          COUNT(*)::int AS count
        FROM posts
        WHERE created_at >= ${from} AND deleted_at IS NULL
        GROUP BY 1 ORDER BY 1
      `,
      this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT
          DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')::date::text AS date,
          COUNT(*)::int AS count
        FROM comments
        WHERE created_at >= ${from} AND deleted_at IS NULL
        GROUP BY 1 ORDER BY 1
      `,
    ]);

    return {
      posts: posts.map((r) => ({ date: r.date, count: Number(r.count) })),
      comments: comments.map((r) => ({ date: r.date, count: Number(r.count) })),
    };
  }

  // Report breakdown by category
  async getReportBreakdown() {
    const breakdown = await this.prisma.report.groupBy({
      by: ['reasonCode', 'status'],
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
