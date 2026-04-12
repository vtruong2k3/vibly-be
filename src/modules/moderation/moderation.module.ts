import { Module } from '@nestjs/common';
import { ModerationController } from './controllers/moderation.controller';
import { ModerationService } from './services/moderation.service';

@Module({
  controllers: [ModerationController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
