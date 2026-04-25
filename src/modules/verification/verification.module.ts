import { Module } from '@nestjs/common';
import { VerificationService } from './verification.service';
import {
    VerificationController,
    AdminVerificationController,
} from './verification.controller';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AdminAuditService } from '../admin/audit-log/admin-audit.service';

@Module({
    imports: [PrismaModule],
    controllers: [VerificationController, AdminVerificationController],
    providers: [VerificationService, AdminAuditService],
    exports: [VerificationService],
})
export class VerificationModule { }
