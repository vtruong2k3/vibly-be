import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../../../common/guards/ws-jwt.guard';
import { PresenceService } from '../services/presence.service';
import { FriendshipsService } from '../../friendships/services/friendships.service';
import { JwtPayload } from '../../../common/decorators/current-user.decorator';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
})
export class PresenceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly presenceService: PresenceService,
    private readonly friendshipsService: FriendshipsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // Manual auth on connection because Guards don't map to handleConnection
  async handleConnection(client: Socket) {
    try {
      let token = client.handshake.auth?.token;
      if (!token && client.handshake.headers.authorization) {
        const [type, payload] = client.handshake.headers.authorization.split(' ');
        if (type === 'Bearer') token = payload;
      }

      if (!token) throw new Error('Missing token');

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('auth.jwtAccessSecret'),
      });
      client.data.user = payload;
      
      const userId = payload.sub;
      await this.presenceService.setOnline(userId, client.id);

      // Join a personal room to receive targeted notifications/messages easily
      client.join(`user:${userId}`);

      // Broadcast to friends that user is online
      this.broadcastStatus(userId, true);
    } catch (error) {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const user: JwtPayload | undefined = client.data.user;
    if (user) {
      const userId = user.sub;
      await this.presenceService.setOffline(userId, client.id);
      
      const isStillOnline = await this.presenceService.isUserOnline(userId);
      if (!isStillOnline) {
        // Broadcast to friends that user is offline
        this.broadcastStatus(userId, false);
      }
    }
  }

  // --- PRIVATE HELPER ---
  private async broadcastStatus(userId: string, isOnline: boolean) {
    try {
      // Get all friends (limit to first 500 for practical broadcast, Phase 2 could optimize)
      const cachedFriendsResult = await this.friendshipsService.listFriends(userId, undefined, 500);
      const friendIds = cachedFriendsResult.data.map(f => f.user.id);
      
      if (friendIds.length > 0) {
        // Emit to all friends' personal rooms
        const rooms = friendIds.map(fid => `user:${fid}`);
        this.server.to(rooms).emit('user_presence_changed', { userId, isOnline });
      }
    } catch (e) {
      // Ignore broadcast error
    }
  }
}
