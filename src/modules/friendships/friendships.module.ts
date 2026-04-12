import { Module } from '@nestjs/common';
import { FriendshipsController } from './controllers/friendships.controller';
import { FriendshipsService } from './services/friendships.service';

@Module({
  controllers: [FriendshipsController],
  providers: [FriendshipsService],
  exports: [FriendshipsService],
})
export class FriendshipsModule {}
