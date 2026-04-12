import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CallsService } from '../services/calls.service';
import { StartCallDto } from '../dto/start-call.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../../common/decorators/current-user.decorator';

@ApiTags('Calls')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'calls', version: '1' })
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  // POST /calls/start — Plan: §Call
  @Post('start')
  @ApiOperation({ summary: 'Start an audio or video call' })
  startCall(@CurrentUser() user: JwtPayload, @Body() dto: StartCallDto) {
    return this.callsService.startCall(user.sub, dto);
  }

  // POST /calls/:id/token — Rejoin or receive token after accepting
  @Post(':id/token')
  @ApiOperation({ summary: 'Get LiveKit token for a call session' })
  getCallToken(@CurrentUser() user: JwtPayload, @Param('id') callSessionId: string) {
    return this.callsService.getCallToken(user.sub, callSessionId);
  }

  // POST /calls/:id/accept
  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept an incoming call' })
  acceptCall(@CurrentUser() user: JwtPayload, @Param('id') callSessionId: string) {
    return this.callsService.acceptCall(user.sub, callSessionId);
  }

  // POST /calls/:id/reject
  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject an incoming call' })
  rejectCall(@CurrentUser() user: JwtPayload, @Param('id') callSessionId: string) {
    return this.callsService.rejectCall(user.sub, callSessionId);
  }

  // POST /calls/:id/end
  @Post(':id/end')
  @ApiOperation({ summary: 'End an active call' })
  endCall(@CurrentUser() user: JwtPayload, @Param('id') callSessionId: string) {
    return this.callsService.endCall(user.sub, callSessionId);
  }

  // GET /calls/:id
  @Get(':id')
  @ApiOperation({ summary: 'Get call session details' })
  getCallSession(@CurrentUser() user: JwtPayload, @Param('id') callSessionId: string) {
    return this.callsService.getCallSession(user.sub, callSessionId);
  }
}
