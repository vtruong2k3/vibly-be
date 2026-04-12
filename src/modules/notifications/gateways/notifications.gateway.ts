import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../../../common/guards/ws-jwt.guard';
import { Notification } from '@prisma/client';

@UseGuards(WsJwtGuard)
@WebSocketGateway({
  cors: { origin: true, credentials: true },
})
export class NotificationsGateway {
  @WebSocketServer()
  server: Server;

  // Called by internal services (e.g. Likes, Comments, FriendRequests) to push notification
  broadcastNotification(userId: string, notification: Partial<Notification>) {
    // We rely on the `user:${userId}` room created in PresenceGateway on connection
    this.server.to(`user:${userId}`).emit('new_notification', notification);
  }
}
