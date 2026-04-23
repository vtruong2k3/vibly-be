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
import { SOCKET_EVENTS } from '../../../common/constants/socket-events';

// Call signaling events — Plan §3 Call Events
@UseGuards(WsJwtGuard)
@WebSocketGateway({
  cors: { origin: true, credentials: true },
})
export class CallsGateway {
  @WebSocketServer()
  server: Server;

  // Server → Callee: Notify an incoming call
  notifyIncomingCall(
    calleeUserId: string,
    payload: {
      callSessionId: string;
      callType: string;
      callerUserId: string;
      callerUsername: string;
      roomName: string;
    },
  ) {
    this.server.to(`user:${calleeUserId}`).emit(SOCKET_EVENTS.CALL_INCOMING, payload);
  }

  // Server → All participants: Call was accepted
  notifyCallAccepted(participantUserIds: string[], callSessionId: string) {
    const rooms = participantUserIds.map((id) => `user:${id}`);
    this.server.to(rooms).emit(SOCKET_EVENTS.CALL_ACCEPTED, { callSessionId });
  }

  // Server → All participants: Call was rejected
  notifyCallRejected(
    participantUserIds: string[],
    callSessionId: string,
    rejectedBy: string,
  ) {
    const rooms = participantUserIds.map((id) => `user:${id}`);
    this.server.to(rooms).emit(SOCKET_EVENTS.CALL_REJECTED, { callSessionId, rejectedBy });
  }

  // Server → All participants: Call ended
  notifyCallEnded(
    participantUserIds: string[],
    callSessionId: string,
    durationSeconds: number,
  ) {
    const rooms = participantUserIds.map((id) => `user:${id}`);
    this.server
      .to(rooms)
      .emit(SOCKET_EVENTS.CALL_ENDED, { callSessionId, durationSeconds });
  }

  // Client → Self cancel before pick up
  @SubscribeMessage(SOCKET_EVENTS.CALL_CANCEL)
  handleCallCancel(
    @ConnectedSocket() client: Socket,
    @MessageBody() callSessionId: string,
  ) {
    const user: JwtPayload = client.data.user;
    // Broadcast cancel to all in personal rooms (CallsService will handle DB)
    this.server.emit(SOCKET_EVENTS.CALL_CANCELED, { callSessionId, canceledBy: user.sub });
  }

  // Client → Server → Client: Relay WebRTC SDP (Offer / Answer)
  @SubscribeMessage(SOCKET_EVENTS.WEBRTC_SDP)
  handleWebRtcSdp(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { targetUserId: string; callSessionId: string; sdp: any }
  ) {
    this.server.to(`user:${payload.targetUserId}`).emit(SOCKET_EVENTS.WEBRTC_SDP, {
      senderUserId: client.data.user.sub,
      callSessionId: payload.callSessionId,
      sdp: payload.sdp,
    });
  }

  // Client → Server → Client: Relay WebRTC ICE Candidate
  @SubscribeMessage(SOCKET_EVENTS.WEBRTC_ICE)
  handleWebRtcIce(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { targetUserId: string; callSessionId: string; candidate: any }
  ) {
    this.server.to(`user:${payload.targetUserId}`).emit(SOCKET_EVENTS.WEBRTC_ICE, {
      senderUserId: client.data.user.sub,
      callSessionId: payload.callSessionId,
      candidate: payload.candidate,
    });
  }
}
