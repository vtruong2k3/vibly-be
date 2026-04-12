import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PresenceGateway } from './gateways/presence.gateway';
import { PresenceService } from './services/presence.service';
import { PresenceController } from './controllers/presence.controller';
import { FriendshipsModule } from '../friendships/friendships.module';

@Module({
  imports: [
    JwtModule.register({}),
    forwardRef(() => FriendshipsModule),
  ],
  controllers: [PresenceController],
  providers: [PresenceGateway, PresenceService],
  exports: [PresenceService, PresenceGateway],
})
export class PresenceModule {}
