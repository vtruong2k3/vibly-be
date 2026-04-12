import { Module } from '@nestjs/common';
import { ProfilesService } from './services/profiles.service';

@Module({
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
