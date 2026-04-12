import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile not found');

    return this.prisma.profile.update({
      where: { userId },
      data: {
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.birthday !== undefined && { birthday: new Date(dto.birthday) }),
        ...(dto.gender !== undefined && { gender: dto.gender }),
        ...(dto.hometown !== undefined && { hometown: dto.hometown }),
        ...(dto.currentCity !== undefined && { currentCity: dto.currentCity }),
        ...(dto.website !== undefined && { website: dto.website }),
        ...(dto.avatarMediaId !== undefined && {
          avatarMediaId: dto.avatarMediaId,
        }),
        ...(dto.coverMediaId !== undefined && {
          coverMediaId: dto.coverMediaId,
        }),
      },
    });
  }

  async getProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: {
        avatarMedia: {
          select: { id: true, objectKey: true, bucket: true, mimeType: true },
        },
        coverMedia: {
          select: { id: true, objectKey: true, bucket: true, mimeType: true },
        },
      },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }
}
