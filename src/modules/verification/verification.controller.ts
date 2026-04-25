import {
    Controller,
    Get,
    Post,
    Patch,
    Body,
    Param,
    Query,
    UseGuards,
    Req,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import {
    SubmitVerificationDto,
    ReviewVerificationDto,
    VerificationFilterDto,
} from './dto/verification.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminJwtGuard } from '../admin/auth/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

// ─── User-facing routes ──────────────────────────────────────────────────────
@ApiTags('Verification')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'verification', version: '1' })
export class VerificationController {
    constructor(private readonly verificationService: VerificationService) { }

    @Post('submit')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: '[User] Submit a KYC verification request' })
    submit(@CurrentUser() user: JwtPayload, @Body() dto: SubmitVerificationDto) {
        return this.verificationService.submit(user.sub, dto);
    }

    @Get('status')
    @ApiOperation({ summary: '[User] Get my verification status & latest request' })
    myStatus(@CurrentUser() user: JwtPayload) {
        return this.verificationService.getMyStatus(user.sub);
    }
}

// ─── Admin-facing routes ─────────────────────────────────────────────────────
@ApiTags('Admin Verification')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MODERATOR)
@Controller({ path: 'admin/kyc', version: '1' })
export class AdminVerificationController {
    constructor(private readonly verificationService: VerificationService) { }

    @Get()
    @ApiOperation({ summary: '[Admin] List KYC requests with filter/pagination' })
    list(@Query() query: VerificationFilterDto) {
        return this.verificationService.listRequests(query);
    }

    @Get(':id')
    @ApiOperation({ summary: '[Admin] Get single KYC request detail' })
    detail(@Param('id') id: string) {
        return this.verificationService.getRequestDetail(id);
    }

    @Patch(':id/review')
    @ApiOperation({ summary: '[Admin] Approve, Reject or Revoke a KYC request' })
    review(
        @CurrentUser() admin: any,
        @Param('id') requestId: string,
        @Body() dto: ReviewVerificationDto,
        @Req() req: any,
    ) {
        return this.verificationService.review(admin.sub, admin.role, requestId, dto, req.ip);
    }

    @Patch('users/:userId/badge')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: '[Admin] Manually grant or revoke verified badge — ADMIN only' })
    toggleBadge(
        @CurrentUser() admin: any,
        @Param('userId') userId: string,
        @Body('grant') grant: boolean,
        @Req() req: any,
    ) {
        return this.verificationService.toggleBadge(admin.sub, admin.role, userId, grant, req.ip);
    }
}
