import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    Body,
    UseGuards,
    HttpCode,
    Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole, ReportSeverity } from '@prisma/client';
import { AdminModerationService } from './admin-moderation.service';

@ApiTags('Admin Moderation')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Controller({ path: 'admin/moderation', version: '1' })
export class AdminModerationController {
    constructor(private readonly adminModService: AdminModerationService) { }

    @Roles(UserRole.ADMIN, UserRole.MODERATOR)
    @Get('keywords')
    async getKeywords() {
        return this.adminModService.getBlacklistedKeywords();
    }

    @Roles(UserRole.ADMIN)
    @Post('keywords')
    async addKeyword(
        @Request() req: any,
        @Body() body: { keyword: string; severity?: ReportSeverity },
    ) {
        return this.adminModService.addBlacklistedKeyword(
            req.user.sub,
            body.keyword,
            body.severity ?? ReportSeverity.HIGH,
        );
    }

    @Roles(UserRole.ADMIN)
    @HttpCode(204)
    @Delete('keywords/:id')
    async removeKeyword(@Param('id') id: string) {
        await this.adminModService.removeBlacklistedKeyword(id);
    }
}
