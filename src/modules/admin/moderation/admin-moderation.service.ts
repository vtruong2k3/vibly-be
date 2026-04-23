import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ReportSeverity } from '@prisma/client';
import { AutoModerationService } from '../../moderation/services/auto-moderation.service';

@Injectable()
export class AdminModerationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly autoMod: AutoModerationService,
    ) { }

    async getBlacklistedKeywords() {
        return this.prisma.blacklistedKeyword.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                keyword: true,
                severity: true,
                createdAt: true,
                creator: {
                    select: {
                        id: true,
                        username: true,
                    },
                },
            },
        });
    }

    async addBlacklistedKeyword(adminId: string, keyword: string, severity: ReportSeverity) {
        const existing = await this.prisma.blacklistedKeyword.findUnique({
            where: { keyword: keyword.toLowerCase() },
        });
        if (existing) return existing;

        const newKeyword = await this.prisma.blacklistedKeyword.create({
            data: {
                keyword: keyword.toLowerCase(),
                severity,
                createdBy: adminId,
            },
        });

        // Invalidate cache in the scanner to pick up the new keyword instantly
        this.autoMod.invalidateCache();
        return newKeyword;
    }

    async removeBlacklistedKeyword(id: string) {
        const existing = await this.prisma.blacklistedKeyword.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Keyword not found');

        await this.prisma.blacklistedKeyword.delete({ where: { id } });
        this.autoMod.invalidateCache();
        return { success: true };
    }
}
