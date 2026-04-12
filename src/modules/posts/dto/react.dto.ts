import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ReactionType } from '@prisma/client';

export class ReactDto {
  @ApiProperty({ enum: ReactionType, example: ReactionType.LIKE })
  @IsEnum(ReactionType)
  reactionType: ReactionType;
}
