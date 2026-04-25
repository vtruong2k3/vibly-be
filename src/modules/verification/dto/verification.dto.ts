import {
    IsEnum,
    IsOptional,
    IsString,
    IsIn,
    MaxLength,
    IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VerificationStatus } from '@prisma/client';

export class SubmitVerificationDto {
    @ApiProperty({ example: 'CCCD', description: 'Type of ID: CCCD, PASSPORT, etc.' })
    @IsString()
    @MaxLength(60)
    idType: string;

    @ApiProperty({ description: 'Legal full name on document' })
    @IsString()
    @MaxLength(150)
    legalName: string;

    @ApiProperty({ description: 'URL of front of document (uploaded via media API)' })
    @IsString()
    frontDocUrl: string;

    @ApiPropertyOptional({ description: 'URL of back of document (if applicable)' })
    @IsString()
    @IsOptional()
    backDocUrl?: string;

    @ApiProperty({ description: 'URL of selfie holding document (uploaded via media API)' })
    @IsString()
    selfieUrl: string;
}

export class ReviewVerificationDto {
    @ApiProperty({ enum: ['APPROVED', 'REJECTED', 'REVOKED'] })
    @IsIn(['APPROVED', 'REJECTED', 'REVOKED'])
    decision: 'APPROVED' | 'REJECTED' | 'REVOKED';

    @ApiPropertyOptional({ description: 'Required when rejecting or revoking' })
    @IsString()
    @IsOptional()
    note?: string;
}

export class VerificationFilterDto {
    @ApiPropertyOptional({ enum: VerificationStatus })
    @IsEnum(VerificationStatus)
    @IsOptional()
    status?: VerificationStatus;

    @ApiPropertyOptional({ description: 'Cursor for pagination (request ID)' })
    @IsString()
    @IsOptional()
    cursor?: string;

    @ApiPropertyOptional({ default: 50 })
    @IsOptional()
    limit?: number;
}
