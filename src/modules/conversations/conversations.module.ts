import { Module } from '@nestjs/common';
import { ConversationsController } from './controllers/conversations.controller';
import { ConversationsService } from './services/conversations.service';

@Module({
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
