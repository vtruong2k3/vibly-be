import { Module } from '@nestjs/common';
import { PostsController } from './controllers/posts.controller';
import { PostsService } from './services/posts.service';
import { PostsGateway } from './gateways/posts.gateway';
import { NotificationsModule } from '../notifications/notifications.module';
import { FeedModule } from '../feed/feed.module';

@Module({
  imports: [NotificationsModule, FeedModule],
  controllers: [PostsController],
  providers: [PostsService, PostsGateway],
  exports: [PostsService],
})
export class PostsModule { }
