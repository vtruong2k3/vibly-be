import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// @Public() — skip JWT guard on a route
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
