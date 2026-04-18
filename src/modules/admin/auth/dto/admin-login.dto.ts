import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminLoginDto {
  @ApiProperty({ example: 'admin@vibly.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SuperSecret123!' })
  @IsString()
  @MinLength(8)
  password: string;
}

export class AdminTotpVerifyDto {
  @ApiProperty({ example: '123456', description: '6-digit TOTP code or backup code' })
  @IsString()
  code: string;

  @ApiProperty({ description: 'Short-lived temp token issued at login step 1' })
  @IsString()
  tempToken: string;
}

export class AdminTotpEnableDto {
  @ApiProperty({ example: '123456', description: 'First TOTP code to confirm setup' })
  @IsString()
  code: string;
}
