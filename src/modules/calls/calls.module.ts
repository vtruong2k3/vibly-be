import { Module } from '@nestjs/common';
import { CallsController } from './controllers/calls.controller';
import { CallsService } from './services/calls.service';
import { CallsGateway } from './gateways/calls.gateway';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [JwtModule.register({})],
  controllers: [CallsController],
  providers: [CallsService, CallsGateway],
  exports: [CallsService, CallsGateway],
})
export class CallsModule {}
