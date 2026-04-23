import { Module, forwardRef } from '@nestjs/common';
import { ModerationController } from './controllers/moderation.controller';
import { ModerationService } from './services/moderation.service';
import { AutoModerationService } from './services/auto-moderation.service';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [forwardRef(() => AdminModule)],
  controllers: [ModerationController],
  providers: [ModerationService, AutoModerationService],
  exports: [ModerationService, AutoModerationService],
})
export class ModerationModule { }
