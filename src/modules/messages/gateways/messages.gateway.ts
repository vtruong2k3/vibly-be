import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../../../common/guards/ws-jwt.guard';
import { JwtPayload } from '../../../common/decorators/current-user.decorator';

@UseGuards(WsJwtGuard)
@WebSocketGateway({
  cors: { origin: true, credentials: true },
})
export class MessagesGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('join_conversation')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ) {
    client.join(`conversation:${conversationId}`);
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ) {
    client.leave(`conversation:${conversationId}`);
  }

  @SubscribeMessage('typing_start')
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ) {
    const user: JwtPayload = client.data.user;
    client.to(`conversation:${conversationId}`).emit('user_typing_start', {
      userId: user.sub,
      conversationId,
    });
  }

  @SubscribeMessage('typing_stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ) {
    const user: JwtPayload = client.data.user;
    client.to(`conversation:${conversationId}`).emit('user_typing_stop', {
      userId: user.sub,
      conversationId,
    });
  }

  // --- Called internally by MessagesService ---
  broadcastNewMessage(conversationId: string, message: any) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('new_message', message);
  }

  broadcastMessageUpdate(
    conversationId: string,
    messageId: string,
    content: string,
  ) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('message_updated', { messageId, content });
  }

  broadcastMessageDelete(conversationId: string, messageId: string) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('message_deleted', { messageId });
  }
}
