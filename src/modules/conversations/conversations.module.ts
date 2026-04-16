import { Module, forwardRef } from '@nestjs/common';
import { ConversationsController } from './controllers/conversations.controller';
import { ConversationsService } from './services/conversations.service';
import { PresenceModule } from '../presence/presence.module';

@Module({
  imports: [forwardRef(() => PresenceModule)],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
