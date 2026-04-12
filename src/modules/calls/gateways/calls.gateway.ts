import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../../../common/guards/ws-jwt.guard';
import { JwtPayload } from '../../../common/decorators/current-user.decorator';

// Call signaling events — Plan §3 Call Events
@UseGuards(WsJwtGuard)
@WebSocketGateway({
  cors: { origin: true, credentials: true },
})
export class CallsGateway {
  @WebSocketServer()
  server: Server;

  // Server → Callee: Notify an incoming call
  notifyIncomingCall(calleeUserId: string, payload: {
    callSessionId: string;
    callType: string;
    callerUserId: string;
    callerUsername: string;
    roomName: string;
  }) {
    this.server.to(`user:${calleeUserId}`).emit('call:incoming', payload);
  }

  // Server → All participants: Call was accepted
  notifyCallAccepted(participantUserIds: string[], callSessionId: string) {
    const rooms = participantUserIds.map((id) => `user:${id}`);
    this.server.to(rooms).emit('call:accepted', { callSessionId });
  }

  // Server → All participants: Call was rejected
  notifyCallRejected(participantUserIds: string[], callSessionId: string, rejectedBy: string) {
    const rooms = participantUserIds.map((id) => `user:${id}`);
    this.server.to(rooms).emit('call:rejected', { callSessionId, rejectedBy });
  }

  // Server → All participants: Call ended
  notifyCallEnded(participantUserIds: string[], callSessionId: string, durationSeconds: number) {
    const rooms = participantUserIds.map((id) => `user:${id}`);
    this.server.to(rooms).emit('call:ended', { callSessionId, durationSeconds });
  }

  // Client → Self cancel before pick up
  @SubscribeMessage('call:cancel')
  handleCallCancel(@ConnectedSocket() client: Socket, @MessageBody() callSessionId: string) {
    const user: JwtPayload = client.data.user;
    // Broadcast cancel to all in personal rooms (CallsService will handle DB)
    this.server.emit('call:canceled', { callSessionId, canceledBy: user.sub });
  }
}
