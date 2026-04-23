import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SystemSetting } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

export interface UpdateSettingDto {
    key: string;
    value: string;
    type?: string;
    description?: string;
}

@Injectable()
export class AdminSettingsService {
    private readonly logger = new Logger(AdminSettingsService.name);

    constructor(
        private readonly prisma: PrismaService,
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    ) { }

    async getAllSettings(): Promise<SystemSetting[]> {
        return this.prisma.systemSetting.findMany({
            orderBy: { key: 'asc' }
        });
    }

    async getSetting(key: string): Promise<SystemSetting | null> {
        return this.prisma.systemSetting.findUnique({
            where: { key }
        });
    }

    async upsertSettings(adminId: string, settings: UpdateSettingDto[]): Promise<SystemSetting[]> {
        const results: SystemSetting[] = [];

        await this.prisma.$transaction(async (tx) => {
            for (const setting of settings) {
                const upserted = await tx.systemSetting.upsert({
                    where: { key: setting.key },
                    update: {
                        value: setting.value,
                        type: setting.type,
                        description: setting.description,
                        updatedBy: adminId,
                    },
                    create: {
                        key: setting.key,
                        value: setting.value,
                        type: setting.type ?? 'BOOLEAN',
                        description: setting.description,
                        updatedBy: adminId,
                    },
                });
                results.push(upserted);
            }
        });

        // Flush Cache
        for (const setting of settings) {
            await this.cacheManager.del(`system_setting:${setting.key}`);
        }

        this.logger.log(`Admin ${adminId} updated ${settings.length} system settings.`);
        return results;
    }
}
