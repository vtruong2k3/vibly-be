import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { PresenceGateway } from '../../presence/gateways/presence.gateway';

@Injectable()
export class RevokerService {
  private readonly logger = new Logger(RevokerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presenceGateway: PresenceGateway,
  ) {}

  // Flush all active sessions for a user and emit force_logout via WebSocket
  async revokeUser(
    userId: string,
    reason: string = 'admin_action',
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });

    // Emit to all sockets in the personal room 'user:{userId}'
    // User joined this room on WS connect (see presence.gateway.ts L54)
    try {
      this.presenceGateway.server.to(`user:${userId}`).emit('force_logout', {
        reason,
        message: 'Your account has been suspended or banned. Please contact support.',
      });
    } catch (err) {
      // Non-fatal: user may not be online. Log and continue.
      this.logger.warn(
        `force_logout emit failed for user ${userId}: ${String(err)}`,
      );
    }

    this.logger.log(
      `All sessions revoked for user ${userId} (reason: ${reason})`,
    );
  }
}
