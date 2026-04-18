import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto, AdminTotpVerifyDto, AdminTotpEnableDto } from './dto/admin-login.dto';
import { AdminJwtGuard } from './admin-jwt.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AdminJwtPayload } from './admin-jwt.strategy';

@ApiTags('Admin Auth')
@Controller({ path: 'admin/auth', version: '1' })
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  // --- AUTH FLOW ---

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5/min — brute force protection
  @ApiOperation({
    summary: '[Admin] Step 1 — Login with email + password',
    description:
      'Returns accessToken directly if TOTP disabled, or { requireTotp: true, tempToken } if TOTP enabled.',
  })
  login(
    @Body() dto: AdminLoginDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    return this.adminAuthService.login(dto, req, res);
  }

  @Post('totp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: '[Admin] Step 2 — Verify TOTP code to complete login',
    description: 'Submit the 6-digit TOTP code (or backup code) + tempToken from step 1.',
  })
  verifyTotp(
    @Body() dto: AdminTotpVerifyDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    return this.adminAuthService.verifyTotp(dto, req, res);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refresh')
  @ApiOperation({ summary: '[Admin] Refresh admin access token via HttpOnly cookie' })
  refresh(@Req() req: any, @Res({ passthrough: true }) res: any) {
    const isProduction = process.env.NODE_ENV === 'production';
    const cookies = req.cookies as Record<string, string> | undefined;
    const token = isProduction
      ? cookies?.['__Host-refresh']
      : (cookies?.['refresh'] ?? cookies?.['__Host-refresh']);
    return this.adminAuthService.refresh(token ?? '', req, res);
  }

  @Post('logout')
  @UseGuards(AdminJwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[Admin] Logout current admin session' })
  logout(
    @CurrentUser() admin: AdminJwtPayload,
    @Res({ passthrough: true }) res: any,
  ) {
    return this.adminAuthService.logout(admin.sessionId, res);
  }

  // --- TOTP SETUP (requires authenticated admin) ---

  @Post('totp/setup')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[Admin] Initiate TOTP setup — returns QR code data URL',
    description: 'Call this first, then scan QR in authenticator app, then call /totp/enable.',
  })
  setupTotp(@CurrentUser() admin: AdminJwtPayload) {
    return this.adminAuthService.setupTotp(admin.sub);
  }

  @Post('totp/enable')
  @UseGuards(AdminJwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[Admin] Enable TOTP — verify first code, receive backup codes',
    description: 'Backup codes shown exactly once. Store them securely.',
  })
  enableTotp(
    @CurrentUser() admin: AdminJwtPayload,
    @Body() dto: AdminTotpEnableDto,
  ) {
    return this.adminAuthService.enableTotp(admin.sub, dto.code);
  }
}
