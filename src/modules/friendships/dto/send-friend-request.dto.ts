import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendFriendRequestDto {
  @ApiProperty({ description: 'UUID of the user to send friend request to' })
  @IsUUID()
  addresseeId: string;
}
