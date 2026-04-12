import { Controller, Get, Post, Patch, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConversationsService } from '../services/conversations.service';
import { CreateConversationDto } from '../dto/create-conversation.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../../common/decorators/current-user.decorator';

@ApiTags('Conversations')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'conversations', version: '1' })
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a direct or group conversation' })
  createConversation(@CurrentUser() user: JwtPayload, @Body() dto: CreateConversationDto) {
    return this.conversationsService.createConversation(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all user conversations' })
  getConversations(@CurrentUser() user: JwtPayload) {
    return this.conversationsService.getConversations(user.sub);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark conversation as read' })
  markAsRead(@CurrentUser() user: JwtPayload, @Param('id') conversationId: string) {
    return this.conversationsService.markAsRead(user.sub, conversationId);
  }
}
