import { Module, forwardRef } from '@nestjs/common';
import { CallsController } from './controllers/calls.controller';
import { CallsService } from './services/calls.service';
import { CallsGateway } from './gateways/calls.gateway';
import { JwtModule } from '@nestjs/jwt';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [JwtModule.register({}), forwardRef(() => MessagesModule)],
  controllers: [CallsController],
  providers: [CallsService, CallsGateway],
  exports: [CallsService, CallsGateway],
})
export class CallsModule {}
