import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';
import { JwtPayload } from '../decorators/current-user.decorator';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();

    // Support both header standard Authorization and socket auth payload
    let token: string | undefined = client.handshake.auth?.token;

    if (!token && client.handshake.headers.authorization) {
      const [type, extractedToken] =
        client.handshake.headers.authorization.split(' ');
      if (type === 'Bearer') {
        token = extractedToken;
      }
    }

    if (!token) {
      throw new UnauthorizedException(
        'Missing authentication token for WebSocket',
      );
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('auth.jwtAccessSecret'),
      });
      // Attack context to socket data so we can access it via client.data.user
      client.data.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token for WebSocket');
    }
  }
}
