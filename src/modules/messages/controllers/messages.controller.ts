import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MessagesService } from '../services/messages.service';
import { CreateMessageDto } from '../dto/create-message.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../../common/decorators/current-user.decorator';

@ApiTags('Messages')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get messages for a conversation (cursor paginated backwards)' })
  getMessages(
    @CurrentUser() user: JwtPayload,
    @Param('id') conversationId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.messagesService.getMessages(user.sub, conversationId, cursor, limit);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a message to a conversation' })
  sendMessage(
    @CurrentUser() user: JwtPayload,
    @Param('id') conversationId: string,
    @Body() dto: CreateMessageDto
  ) {
    return this.messagesService.sendMessage(user.sub, conversationId, dto);
  }

  @Patch('messages/:id')
  @ApiOperation({ summary: 'Edit a message' })
  editMessage(
    @CurrentUser() user: JwtPayload,
    @Param('id') messageId: string,
    @Body('content') content: string
  ) {
    return this.messagesService.editMessage(user.sub, messageId, content);
  }

  @Delete('messages/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a message' })
  deleteMessage(
    @CurrentUser() user: JwtPayload,
    @Param('id') messageId: string
  ) {
    return this.messagesService.deleteMessage(user.sub, messageId);
  }
}
