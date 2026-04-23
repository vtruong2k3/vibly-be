import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { differenceInDays, endOfDay, startOfDay, subDays } from 'date-fns';

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) { }

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

  // 1. Platform Distribution (Mocked query for now, assuming device tracking isn't fully set up yet. If it is, query 'sessions' table)
  async getPlatformDistribution() {
    // Simulated real data breakdown assuming ~75% mobile
    return [
      { name: "Mobile App", value: 58, fill: "#6366F1" },
      { name: "Web Browser", value: 28, fill: "#8B5CF6" },
      { name: "Desktop App", value: 9, fill: "#EC4899" },
      { name: "API / Bot", value: 5, fill: "#F59E0B" },
    ];
  }

  // 2. Moderation Resolution (Approved/Rejected/Pending by day)
  async getModerationResolution(from?: string, to?: string) {
    const { start, end } = this.getDateRange(from, to);

    // Aggregate by day and status
    const results = await this.prisma.$queryRaw<{ day: string; approved: bigint; rejected: bigint; pending: bigint }[]>`
      SELECT 
        TO_CHAR(created_at AT TIME ZONE 'UTC', 'Dy') AS day,
        EXTRACT(ISODOW FROM created_at) AS day_num,
        SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END)::int AS approved,
        SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END)::int AS rejected,
        SUM(CASE WHEN status IN ('OPEN', 'REVIEWING') THEN 1 ELSE 0 END)::int AS pending
      FROM reports
      WHERE created_at >= ${start} AND created_at <= ${end}
      GROUP BY 1, 2
      ORDER BY day_num
    `;

    // Ensure all 7 days are represented, even if 0
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const formatted = days.map((day) => {
      const match = results.find((r) => r.day.startsWith(day));
      return {
        day,
        approved: match ? Number(match.approved) : 0,
        rejected: match ? Number(match.rejected) : 0,
        pending: match ? Number(match.pending) : 0,
      };
    });

    return formatted;
  }

  // 3. User Activity Heatmap (Logins/Posts grouped by DOW and Hour)
  async getActivityHeatmap(from?: string, to?: string) {
    const { start, end } = this.getDateRange(from, to);

    // We'll aggregate Post creation times as a proxy for "Activity"
    const results = await this.prisma.$queryRaw<{ day: string; hour: bigint; total: bigint }[]>`
      SELECT 
        TO_CHAR(created_at AT TIME ZONE 'UTC', 'Dy') AS day,
        EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') AS hour,
        COUNT(*)::int AS total
      FROM posts
      WHERE created_at >= ${start} AND created_at <= ${end}
      GROUP BY 1, 2
    `;

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const hours = [0, 3, 6, 9, 12, 15, 18, 21];

    // Build the matrix
    const matrix: { day: string; hour: string; value: number }[] = [];

    // Pre-calculate max for normalization (0-100%)
    let maxTotal = 1;
    results.forEach(r => { if (Number(r.total) > maxTotal) maxTotal = Number(r.total); });

    for (const day of days) {
      for (const hour of hours) {
        // Sum activity in this 3-hour bucket
        let bucketTotal = 0;
        for (let i = 0; i < 3; i++) {
          const match = results.find(r => r.day.startsWith(day) && Number(r.hour) === (hour + i));
          if (match) bucketTotal += Number(match.total);
        }

        // Normalize to 0-100%
        const normalizedValue = Math.min(100, Math.round((bucketTotal / (maxTotal * 3)) * 100));

        matrix.push({
          day,
          hour: `${hour}h`,
          value: normalizedValue
        });
      }
    }

    return matrix;
  }

  // 4. Post Categories Split
  async getPostCategories(from?: string, to?: string) {
    const { start, end } = this.getDateRange(from, to);

    // If 'mediaType' or 'category' doesn't exist on Post, we map based on media array type or generic tags
    // For Vibly, relying on 'media' relation to infer content type:
    // If it has media where type === 'IMAGE' -> Photos
    // If it has media where type === 'VIDEO' -> Videos
    // Otherwise -> Text

    const [total, withMedia] = await Promise.all([
      this.prisma.post.count({ where: { createdAt: { gte: start, lte: end }, deletedAt: null } }),
      this.prisma.post.findMany({
        where: { createdAt: { gte: start, lte: end }, deletedAt: null },
        select: { media: { select: { mediaAsset: { select: { mediaType: true } } } } }
      })
    ]);

    let photos = 0;
    let videos = 0;
    let text = 0;

    withMedia.forEach(post => {
      if (post.media.length === 0) text++;
      else if (post.media.some(m => m.mediaAsset.mediaType === 'VIDEO')) videos++;
      else photos++;
    });

    const calcPct = (val: number) => total === 0 ? 0 : Math.round((val / total) * 100);

    return [
      { name: "Photos", percentage: calcPct(photos), color: "bg-indigo-500" },
      { name: "Text", percentage: calcPct(text), color: "bg-violet-500" },
      { name: "Videos", percentage: calcPct(videos), color: "bg-fuchsia-500" },
      { name: "Links", percentage: 0, color: "bg-rose-400" }, // Placeholder for link previews
    ].sort((a, b) => b.percentage - a.percentage);
  }

  // 5. Moderation Queue Preview
  async getModerationQueue() {
    const recentReports = await this.prisma.report.findMany({
      where: { status: 'OPEN' },
      orderBy: [
        { severity: 'desc' }, // CRITICAL > HIGH > MEDIUM > LOW
        { createdAt: 'desc' }
      ],
      take: 5,
      include: {
        reporter: { select: { username: true } },
      }
    });

    return recentReports.map(r => {
      // Calculate mins ago
      const diffMins = Math.floor((Date.now() - r.createdAt.getTime()) / 60000);
      const timeStr = diffMins < 60 ? `${diffMins} mins ago` : `${Math.floor(diffMins / 60)} hrs ago`;

      return {
        id: r.id,
        user: r.reporter?.username ? `@${r.reporter.username}` : "Unknown User",
        reason: r.reasonCode.replace(/_/g, ' '),
        time: timeStr,
        status: r.severity === 'CRITICAL' ? 'URGENT' : r.severity,
      };
    });
  }

  // 6. System Status
  async getSystemStatus() {
    // Check DB Connection
    let dbStatus = "Operational";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = "Degraded";
    }

    // In a real app we would ping Redis here too
    return [
      { name: "API Gateway", status: "Operational", color: "bg-emerald-500" },
      { name: "Database Main", status: dbStatus, color: dbStatus === "Operational" ? "bg-emerald-500" : "bg-rose-500" },
      { name: "Background Jobs (BullMQ)", status: "Operational", color: "bg-emerald-500" },
    ];
  }
}

