import { Module } from '@nestjs/common';
import { FeedController } from './controllers/feed.controller';
import { FeedService } from './services/feed.service';

@Module({
  controllers: [FeedController],
  providers: [FeedService],
  exports: [FeedService],
})
export class FeedModule {}
