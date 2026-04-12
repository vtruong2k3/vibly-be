import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

// @Roles(UserRole.ADMIN, UserRole.MODERATOR) — restrict to specific roles
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
