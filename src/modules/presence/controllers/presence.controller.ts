import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PresenceService } from '../services/presence.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

@ApiTags('Presence')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'presence', version: '1' })
export class PresenceController {
  constructor(private readonly presenceService: PresenceService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get online status for an array of user IDs' })
  @ApiQuery({ name: 'ids', type: String, description: 'Comma separated UUIDs', required: true })
  async getStatuses(@Query('ids') idsRaw: string) {
    if (!idsRaw) return {};
    const ids = idsRaw.split(',').filter(id => id.length > 0);
    return this.presenceService.getOnlineStatuses(ids);
  }
}
