import { Module, forwardRef } from '@nestjs/common';
import { FriendshipsController } from './controllers/friendships.controller';
import { FriendshipsService } from './services/friendships.service';
import { PresenceModule } from '../presence/presence.module';

@Module({
  imports: [forwardRef(() => PresenceModule)],
  controllers: [FriendshipsController],
  providers: [FriendshipsService],
  exports: [FriendshipsService],
})
export class FriendshipsModule {}
