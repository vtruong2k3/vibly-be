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
import { SOCKET_EVENTS } from '../../../common/constants/socket-events';

@UseGuards(WsJwtGuard)
@WebSocketGateway({
  cors: { origin: true, credentials: true },
})
export class MessagesGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage(SOCKET_EVENTS.JOIN_CONVERSATION)
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ) {
    client.join(`conversation:${conversationId}`);
  }

  @SubscribeMessage(SOCKET_EVENTS.LEAVE_CONVERSATION)
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ) {
    client.leave(`conversation:${conversationId}`);
  }

  @SubscribeMessage(SOCKET_EVENTS.TYPING_START)
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ) {
    const user: JwtPayload = client.data.user;
    client.to(`conversation:${conversationId}`).emit(SOCKET_EVENTS.USER_TYPING_START, {
      userId: user.sub,
      conversationId,
    });
  }

  @SubscribeMessage(SOCKET_EVENTS.TYPING_STOP)
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ) {
    const user: JwtPayload = client.data.user;
    client.to(`conversation:${conversationId}`).emit(SOCKET_EVENTS.USER_TYPING_STOP, {
      userId: user.sub,
      conversationId,
    });
  }

  // --- Called internally by MessagesService ---
  broadcastNewMessage(conversationId: string, message: any) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit(SOCKET_EVENTS.NEW_MESSAGE, message);
  }

  broadcastMessageUpdate(
    conversationId: string,
    messageId: string,
    content: string,
  ) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit(SOCKET_EVENTS.MESSAGE_UPDATED, { messageId, content });
  }

  broadcastMessageDelete(conversationId: string, messageId: string) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit(SOCKET_EVENTS.MESSAGE_DELETED, { messageId });
  }
}
