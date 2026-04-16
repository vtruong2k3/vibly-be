import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AccessToken } from 'livekit-server-sdk';
import { CallStatus, CallJoinStatus, NotificationType } from '@prisma/client';
import { StartCallDto } from '../dto/start-call.dto';
import { randomUUID } from 'crypto';
import { MessagesService } from '../../messages/services/messages.service';
import { CallsGateway } from '../gateways/calls.gateway';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messagesService: MessagesService,
    @Inject(forwardRef(() => CallsGateway))
    private readonly callsGateway: CallsGateway,
  ) {}

  // POST /calls/start — Initiator creates call session, invites participants
  async startCall(initiatorId: string, dto: StartCallDto) {
    const { callType, conversationId, participantIds } = dto;

    // Validate participants exist
    const participants = await this.prisma.user.findMany({
      where: { id: { in: participantIds }, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, username: true, profile: { select: { displayName: true, avatarMediaId: true } } },
    });
    if (participants.length !== participantIds.length) {
      throw new BadRequestException(
        'One or more participants not found or invalid',
      );
    }

    const initiator = await this.prisma.user.findUnique({
      where: { id: initiatorId },
      select: { id: true, username: true, profile: { select: { displayName: true, avatarMediaId: true } } },
    });

    const roomName = `call-${randomUUID()}`;

    // Create CallSession + Participants in a single transaction
    const callSession = await this.prisma.$transaction(async (tx) => {
      const session = await tx.callSession.create({
        data: {
          initiatorUserId: initiatorId,
          conversationId,
          callType,
          provider: 'livekit',
          roomName,
          status: CallStatus.RINGING,
          participants: {
            create: [
              // Initiator joins immediately
              {
                userId: initiatorId,
                role: 'host',
                joinStatus: CallJoinStatus.JOINED,
                joinedAt: new Date(),
              },
              // Others are invited
              ...participantIds.map((userId) => ({
                userId,
                role: 'participant',
                joinStatus: CallJoinStatus.INVITED,
              })),
            ],
          },
        },
        include: { participants: true },
      });

      // Log call_start event
      await tx.callEvent.create({
        data: {
          callSessionId: session.id,
          actorUserId: initiatorId,
          eventType: 'call_started',
          payload: { callType, participantCount: participantIds.length + 1 },
        },
      });

      return session;
    });

    // Notify ALL invited participants via WebSocket
    participantIds.forEach(calleeId => {
      this.callsGateway.notifyIncomingCall(calleeId, {
        callSessionId: callSession.id,
        callType,
        callerUserId: initiator?.id || initiatorId,
        callerUsername: initiator?.username || 'Unknown',
        roomName,
      });
    });

    // Generate initiator's LiveKit token
    const token = await this.generateLivekitToken(
      roomName,
      initiatorId,
      'host',
    );

    this.logger.log(
      `Call ${callSession.id} started by ${initiatorId} in room ${roomName}`,
    );

    return {
      callSessionId: callSession.id,
      roomName,
      token,
      liveKitUrl: this.configService.get<string>('livekit.host'),
    };
  }

  // POST /calls/:id/token — Re-issue participant LiveKit token (join from accept)
  async getCallToken(userId: string, callSessionId: string) {
    const participant = await this.prisma.callParticipant.findFirst({
      where: { callSessionId, userId },
      include: { callSession: true },
    });

    if (!participant)
      throw new ForbiddenException('You are not invited to this call');

    if (
      participant.callSession.status === CallStatus.ENDED ||
      participant.callSession.status === CallStatus.REJECTED ||
      participant.callSession.status === CallStatus.CANCELED
    ) {
      throw new BadRequestException('Call is no longer active');
    }

    const token = await this.generateLivekitToken(
      participant.callSession.roomName,
      userId,
      'participant',
    );

    return {
      token,
      roomName: participant.callSession.roomName,
      liveKitUrl: this.configService.get<string>('livekit.host'),
    };
  }

  // POST /calls/:id/accept
  async acceptCall(userId: string, callSessionId: string) {
    const participant = await this.findParticipantOrThrow(
      userId,
      callSessionId,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.callParticipant.update({
        where: { id: participant.id },
        data: { joinStatus: CallJoinStatus.ACCEPTED, joinedAt: new Date() },
      });
      // Mark session as in-progress from RINGING → ACCEPTED on first acceptance
      if (participant.callSession.status === CallStatus.RINGING) {
        await tx.callSession.update({
          where: { id: callSessionId },
          data: { status: CallStatus.ACCEPTED, answeredAt: new Date() },
        });
      }
      await tx.callEvent.create({
        data: {
          callSessionId,
          actorUserId: userId,
          eventType: 'call_accepted',
        },
      });
    });

    // Generate the joiner's LiveKit token
    const token = await this.generateLivekitToken(
      participant.callSession.roomName,
      userId,
      'participant',
    );

    return {
      token,
      roomName: participant.callSession.roomName,
      liveKitUrl: this.configService.get<string>('livekit.host'),
    };
  }

  // POST /calls/:id/reject
  async rejectCall(userId: string, callSessionId: string) {
    const participant = await this.findParticipantOrThrow(
      userId,
      callSessionId,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.callParticipant.update({
        where: { id: participant.id },
        data: { joinStatus: CallJoinStatus.REJECTED, leftAt: new Date() },
      });
      // Only 1:1 call: mark entire session as REJECTED immediately
      const otherParticipants = await tx.callParticipant.count({
        where: { callSessionId, NOT: { userId }, joinStatus: 'ACCEPTED' },
      });
      if (otherParticipants === 0) {
        const updatedSession = await tx.callSession.update({
          where: { id: callSessionId },
          data: {
            status: CallStatus.REJECTED,
            endedAt: new Date(),
            endedReason: 'rejected',
          },
        });
        
        if (updatedSession.conversationId) {
          // Fire and forget system message
          this.messagesService.createSystemCallMessage(
            updatedSession.conversationId,
            updatedSession.initiatorUserId,
            JSON.stringify({ event: 'call_rejected', callType: updatedSession.callType })
          ).catch(e => this.logger.error('Failed to create system message', e));
        }
      }
      await tx.callEvent.create({
        data: {
          callSessionId,
          actorUserId: userId,
          eventType: 'call_rejected',
        },
      });
    });

    const session = await this.prisma.callSession.findUnique({
      where: { id: callSessionId },
      include: { participants: true },
    });
    if (session) {
      const allParticipantIds = session.participants.map(p => p.userId);
      this.callsGateway.notifyCallRejected(allParticipantIds, callSessionId, userId);
    }

    return { message: 'Call rejected' };
  }

  // POST /calls/:id/end
  async endCall(userId: string, callSessionId: string) {
    const session = await this.prisma.callSession.findUnique({
      where: { id: callSessionId },
      include: { participants: true },
    });

    if (!session) throw new NotFoundException('Call session not found');

    // Idempotent guard — if already ended, return success silently.
    // Prevents errors from duplicate endCall calls (race condition between
    // socket event handler and LiveKit onDisconnected callback on client side).
    const terminalStatuses = [CallStatus.ENDED, CallStatus.REJECTED, CallStatus.CANCELED];
    if (terminalStatuses.includes(session.status)) {
      return { message: 'Call ended', durationSeconds: session.durationSeconds ?? 0 };
    }

    // Only initiator or any participant in an active call can end it
    const isParticipant = session.participants.some((p) => p.userId === userId);
    if (!isParticipant)
      throw new ForbiddenException('Not a participant of this call');

    const now = new Date();
    const durationSeconds = session.answeredAt
      ? Math.floor((now.getTime() - session.answeredAt.getTime()) / 1000)
      : 0;

    await this.prisma.$transaction(async (tx) => {
      const updatedSession = await tx.callSession.update({
        where: { id: callSessionId },
        data: {
          status: CallStatus.ENDED,
          endedAt: now,
          durationSeconds,
          endedReason:
            userId === session.initiatorUserId
              ? 'initiator_ended'
              : 'participant_ended',
        },
      });
      // Mark remaining active participants as LEFT
      await tx.callParticipant.updateMany({
        where: { callSessionId, joinStatus: { in: ['JOINED', 'ACCEPTED'] } },
        data: { joinStatus: CallJoinStatus.LEFT, leftAt: now },
      });
      await tx.callEvent.create({
        data: {
          callSessionId,
          actorUserId: userId,
          eventType: 'call_ended',
          payload: { durationSeconds },
        },
      });

      if (updatedSession.conversationId) {
        // Fire and forget system message
        this.messagesService.createSystemCallMessage(
          updatedSession.conversationId,
          updatedSession.initiatorUserId,
          JSON.stringify({ event: 'call_ended', callType: updatedSession.callType, durationSeconds })
        ).catch(e => this.logger.error('Failed to create system message', e));
      }
    });

    const allParticipantIds = session.participants.map(p => p.userId);
    this.callsGateway.notifyCallEnded(allParticipantIds, callSessionId, durationSeconds);

    return { message: 'Call ended', durationSeconds };
  }

  // GET /calls/:id — Get call session details
  async getCallSession(userId: string, callSessionId: string) {
    const session = await this.prisma.callSession.findUnique({
      where: { id: callSessionId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                username: true,
                profile: { select: { displayName: true, avatarMediaId: true } },
              },
            },
          },
        },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session) throw new NotFoundException('Call session not found');

    const isParticipant = session.participants.some((p) => p.userId === userId);
    if (!isParticipant)
      throw new ForbiddenException('Not a participant of this call');

    return session;
  }

  // GET /calls/config/ice-servers
  async getIceServers() {
    // In production, you would fetch these from Twilio or Coturn using ConfigService
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };
  }

  // --- PRIVATE ---
  private async findParticipantOrThrow(userId: string, callSessionId: string) {
    const participant = await this.prisma.callParticipant.findFirst({
      where: { callSessionId, userId },
      include: { callSession: true },
    });
    if (!participant)
      throw new ForbiddenException('You are not a participant in this call');
    if (
      participant.callSession.status === CallStatus.ENDED ||
      participant.callSession.status === CallStatus.CANCELED
    ) {
      throw new BadRequestException('Call has already ended');
    }
    return participant;
  }

  private async generateLivekitToken(
    roomName: string,
    userId: string,
    role: 'host' | 'participant',
  ): Promise<string> {
    const apiKey = this.configService.get<string>('livekit.apiKey', '');
    const apiSecret = this.configService.get<string>('livekit.apiSecret', '');
    const ttl = this.configService.get<number>('livekit.tokenTtl', 3600);

    if (!apiKey || !apiSecret) {
      this.logger.warn(
        'LiveKit credentials not set — returning dummy token for dev',
      );
      return 'dev-livekit-token';
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      ttl,
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: role === 'host',
    });

    return token.toJwt();
  }
}
