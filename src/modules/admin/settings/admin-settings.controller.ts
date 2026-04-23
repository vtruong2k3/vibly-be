import {
    Controller,
    Get,
    Patch,
    Body,
    UseGuards,
    Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { AdminSettingsService, UpdateSettingDto } from './admin-settings.service';

@ApiTags('Admin Settings')
@ApiBearerAuth('access-token')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller({ path: 'admin/settings', version: '1' })
export class AdminSettingsController {
    constructor(private readonly settingsService: AdminSettingsService) { }

    @Get()
    @ApiOperation({ summary: '[Admin] Get all system settings' })
    async getSettings() {
        return this.settingsService.getAllSettings();
    }

    @Patch()
    @ApiOperation({ summary: '[Admin] Upsert system settings — ADMIN only' })
    async updateSettings(
        @Request() req: any,
        @Body() body: { settings: UpdateSettingDto[] },
    ) {
        return this.settingsService.upsertSettings(req.user.sub, body.settings);
    }
}
