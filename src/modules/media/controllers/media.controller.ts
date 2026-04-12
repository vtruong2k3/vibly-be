import { Controller, Post, Patch, Delete, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MediaService } from '../services/media.service';
import { CreatePresignedUrlDto } from '../dto/create-presigned-url.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../../common/decorators/current-user.decorator';

@ApiTags('Media')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'media', version: '1' })
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  // POST /media/presigned-url
  @Post('presigned-url')
  @ApiOperation({ summary: 'Get S3 presigned URL for direct upload' })
  createPresignedUrl(@CurrentUser() user: JwtPayload, @Body() dto: CreatePresignedUrlDto) {
    return this.mediaService.createPresignedUrl(user.sub, dto);
  }

  // PATCH /media/:id/confirm
  @Patch(':id/confirm')
  @ApiOperation({ summary: 'Confirm media upload success and mark as READY' })
  confirmUpload(@CurrentUser() user: JwtPayload, @Param('id') mediaAssetId: string) {
    return this.mediaService.confirmUpload(user.sub, mediaAssetId);
  }

  // GET /media/:id
  @Get(':id')
  @ApiOperation({ summary: 'Get media asset metadata' })
  getMediaAsset(@CurrentUser() user: JwtPayload, @Param('id') mediaAssetId: string) {
    return this.mediaService.getMediaAsset(user.sub, mediaAssetId);
  }

  // DELETE /media/:id
  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a media asset' })
  deleteMediaAsset(@CurrentUser() user: JwtPayload, @Param('id') mediaAssetId: string) {
    return this.mediaService.deleteMediaAsset(user.sub, mediaAssetId);
  }
}
