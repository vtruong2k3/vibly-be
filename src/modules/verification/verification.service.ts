import {
    Injectable,
    BadRequestException,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AdminAuditService } from '../admin/audit-log/admin-audit.service';
import { VerificationStatus, UserRole } from '@prisma/client';
import type { SubmitVerificationDto, ReviewVerificationDto, VerificationFilterDto } from './dto/verification.dto';

@Injectable()
export class VerificationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auditService: AdminAuditService,
    ) { }

    // ─── User: Submit a new KYC request ────────────────────────────────────────
    async submit(userId: string, dto: SubmitVerificationDto) {
        // Block submit if a PENDING request already exists
        const existing = await this.prisma.verificationRequest.findFirst({
            where: { userId, status: VerificationStatus.PENDING },
        });
        if (existing) {
            throw new BadRequestException(
                'You already have a pending verification request. Please wait for review.',
            );
        }

        const req = await this.prisma.verificationRequest.create({
            data: {
                userId,
                idType: dto.idType,
                legalName: dto.legalName,
                frontDocUrl: dto.frontDocUrl,
                backDocUrl: dto.backDocUrl,
                selfieUrl: dto.selfieUrl,
                status: VerificationStatus.PENDING,
            },
            select: {
                id: true,
                status: true,
                submittedAt: true,
            },
        });

        return req;
    }

    // ─── User: Get own current verification status ─────────────────────────────
    async getMyStatus(userId: string) {
        const latest = await this.prisma.verificationRequest.findFirst({
            where: { userId },
            orderBy: { submittedAt: 'desc' },
            select: {
                id: true,
                status: true,
                idType: true,
                legalName: true,
                reviewNote: true,
                reviewedAt: true,
                submittedAt: true,
            },
        });

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { isVerified: true, verifiedAt: true },
        });

        return { ...user, latestRequest: latest };
    }

    // ─── Admin: List KYC requests with filters ─────────────────────────────────
    async listRequests(params: VerificationFilterDto) {
        const take = Math.min(params.limit ?? 50, 100);

        const requests = await this.prisma.verificationRequest.findMany({
            where: {
                ...(params.status && { status: params.status }),
            },
            take,
            ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
            orderBy: { submittedAt: 'desc' },
            select: {
                id: true,
                status: true,
                idType: true,
                legalName: true,
                frontDocUrl: true,
                backDocUrl: true,
                selfieUrl: true,
                reviewNote: true,
                reviewedAt: true,
                submittedAt: true,
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        isVerified: true,
                    },
                },
                reviewer: {
                    select: { username: true, role: true },
                },
            },
        });

        return {
            data: requests,
            meta: {
                nextCursor: requests.length === take ? requests[requests.length - 1].id : null,
            },
        };
    }

    // ─── Admin: Get single request detail ──────────────────────────────────────
    async getRequestDetail(requestId: string) {
        const req = await this.prisma.verificationRequest.findUnique({
            where: { id: requestId },
            include: {
                user: { select: { id: true, username: true, email: true, isVerified: true } },
                reviewer: { select: { username: true, role: true } },
            },
        });
        if (!req) throw new NotFoundException('Verification request not found');
        return req;
    }

    // ─── Admin: Review (approve / reject / revoke) ─────────────────────────────
    async review(
        reviewerId: string,
        reviewerRole: string,
        requestId: string,
        dto: ReviewVerificationDto,
        ip?: string,
    ) {
        if (reviewerRole !== UserRole.ADMIN && reviewerRole !== UserRole.MODERATOR) {
            throw new ForbiddenException('Insufficient permissions to review KYC requests');
        }

        if ((dto.decision === 'REJECTED' || dto.decision === 'REVOKED') && !dto.note?.trim()) {
            throw new BadRequestException('A note is required when rejecting or revoking a request');
        }

        const req = await this.prisma.verificationRequest.findUnique({
            where: { id: requestId },
            select: { id: true, userId: true, status: true },
        });
        if (!req) throw new NotFoundException('Verification request not found');

        if (req.status !== VerificationStatus.PENDING && dto.decision !== 'REVOKED') {
            throw new BadRequestException(`Request is already ${req.status.toLowerCase()}`);
        }

        const newStatus = VerificationStatus[dto.decision];
        const isApproved = dto.decision === 'APPROVED';
        const isRevoked = dto.decision === 'REVOKED';

        // Transactional: update request + update user badge atomically
        await this.prisma.$transaction([
            this.prisma.verificationRequest.update({
                where: { id: requestId },
                data: {
                    status: newStatus,
                    reviewerId,
                    reviewNote: dto.note,
                    reviewedAt: new Date(),
                },
            }),
            this.prisma.user.update({
                where: { id: req.userId },
                data: {
                    isVerified: isApproved ? true : isRevoked ? false : undefined,
                    verifiedAt: isApproved ? new Date() : isRevoked ? null : undefined,
                },
            }),
        ]);

        await this.auditService.write(
            reviewerId,
            `KYC_${dto.decision}`,
            'USER',
            req.userId,
            { requestId, decision: dto.decision },
            ip,
            undefined,
            dto.note,
        );

        return { requestId, decision: dto.decision, userId: req.userId };
    }

    // ─── Admin: Manual toggle badge (no KYC flow) ──────────────────────────────
    async toggleBadge(
        adminId: string,
        adminRole: string,
        targetUserId: string,
        grant: boolean,
        ip?: string,
    ) {
        if (adminRole !== UserRole.ADMIN) {
            throw new ForbiddenException('Only ADMIN can manually toggle verified badge');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: targetUserId },
            select: { id: true },
        });
        if (!user) throw new NotFoundException('User not found');

        await this.prisma.user.update({
            where: { id: targetUserId },
            data: {
                isVerified: grant,
                verifiedAt: grant ? new Date() : null,
            },
        });

        await this.auditService.write(
            adminId,
            grant ? 'USER_BADGE_GRANTED' : 'USER_BADGE_REVOKED',
            'USER',
            targetUserId,
            { manual: true, grant },
            ip,
        );

        return { userId: targetUserId, isVerified: grant };
    }
}
