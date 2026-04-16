import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

/**
 * PostsGateway – broadcasts real-time post interaction events (like/comment)
 * to all connected clients.
 *
 * It relies on the per-user room `user:<userId>` joined in PresenceGateway
 * and the global `feed` room that each feed-page client joins.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class PostsGateway {
  @WebSocketServer()
  server: Server;

  /** Emitted when reaction count on a post changes */
  broadcastPostReaction(postId: string, data: { reactionCount: number; postId: string }) {
    this.server.emit('post:reaction_updated', data);
  }

  /** Emitted when comment count on a post changes + new comment payload */
  broadcastNewComment(postId: string, comment: any) {
    this.server.emit('post:new_comment', { postId, comment });
  }
}
