import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FriendshipsService } from '../services/friendships.service';
import { SendFriendRequestDto } from '../dto/send-friend-request.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../../common/decorators/current-user.decorator';

@ApiTags('Friendships')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class FriendshipsController {
  constructor(private readonly friendshipsService: FriendshipsService) {}

  // GET /friends
  @Get('friends')
  @ApiOperation({ summary: 'List friends with cursor pagination' })
  listFriends(
    @CurrentUser() user: JwtPayload,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.friendshipsService.listFriends(user.sub, cursor, limit);
  }

  // GET /friends/requests
  @Get('friends/requests')
  @ApiOperation({ summary: 'List incoming pending friend requests' })
  listRequests(@CurrentUser() user: JwtPayload) {
    return this.friendshipsService.listIncomingRequests(user.sub);
  }

  // GET /friends/status/:targetId
  @Get('friends/status/:targetId')
  @ApiOperation({ summary: 'Get friendship status with a target user' })
  getStatus(
    @CurrentUser() user: JwtPayload,
    @Param('targetId') targetId: string,
  ) {
    return this.friendshipsService.getFriendshipStatus(user.sub, targetId);
  }

  // POST /friends/request
  @Post('friends/request')
  @ApiOperation({ summary: 'Send a friend request' })
  sendRequest(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendFriendRequestDto,
  ) {
    return this.friendshipsService.sendRequest(user.sub, dto);
  }

  // POST /friends/:requestId/accept
  @Post('friends/:requestId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a friend request' })
  acceptRequest(
    @CurrentUser() user: JwtPayload,
    @Param('requestId') requestId: string,
  ) {
    return this.friendshipsService.acceptRequest(user.sub, requestId);
  }

  // POST /friends/:requestId/reject
  @Post('friends/:requestId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a friend request' })
  rejectRequest(
    @CurrentUser() user: JwtPayload,
    @Param('requestId') requestId: string,
  ) {
    return this.friendshipsService.rejectRequest(user.sub, requestId);
  }

  // DELETE /friends/requests/:requestId
  @Delete('friends/requests/:requestId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a sent friend request' })
  cancelRequest(
    @CurrentUser() user: JwtPayload,
    @Param('requestId') requestId: string,
  ) {
    return this.friendshipsService.cancelRequest(user.sub, requestId);
  }

  // DELETE /friends/:userId
  @Delete('friends/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a friend' })
  removeFriend(
    @CurrentUser() user: JwtPayload,
    @Param('userId') friendId: string,
  ) {
    return this.friendshipsService.removeFriend(user.sub, friendId);
  }

  // POST /blocks/:userId
  @Post('blocks/:userId')
  @ApiOperation({ summary: 'Block a user' })
  blockUser(
    @CurrentUser() user: JwtPayload,
    @Param('userId') blockedId: string,
  ) {
    return this.friendshipsService.blockUser(user.sub, blockedId);
  }

  // DELETE /blocks/:userId
  @Delete('blocks/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock a user' })
  unblockUser(
    @CurrentUser() user: JwtPayload,
    @Param('userId') blockedId: string,
  ) {
    return this.friendshipsService.unblockUser(user.sub, blockedId);
  }
}
