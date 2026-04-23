import { Injectable, NestMiddleware, ServiceUnavailableException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';


import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';
import type { Cache } from 'cache-manager';

@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
    constructor(
        private readonly prisma: PrismaService,
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    ) { }

    async use(req: Request, res: Response, next: NextFunction) {
        // Skip maintenance check for /api/v1/admin to allow admins to un-maintain the site!
        if (req.originalUrl.startsWith('/api/v1/admin')) {
            return next();
        }

        const cacheKey = 'system_setting:MAINTENANCE_MODE';
        let isMaintenance = await this.cacheManager.get<boolean>(cacheKey);

        if (isMaintenance === undefined || isMaintenance === null) {
            const setting = await this.prisma.systemSetting.findUnique({
                where: { key: 'MAINTENANCE_MODE' },
            });
            isMaintenance = setting?.value === 'true';
            await this.cacheManager.set(cacheKey, isMaintenance, 60000); // 60s cache
        }

        if (isMaintenance) {
            throw new ServiceUnavailableException('Vibly is currently under maintenance. Please try again later.');
        }

        next();
    }
}
