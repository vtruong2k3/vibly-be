import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ResendVerificationDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail({}, { message: 'Must be a valid email address' })
  email: string;
}
