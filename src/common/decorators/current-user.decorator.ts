import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface JwtPayload {
  sub: string;       // user UUID
  email: string;
  role: string;
  sessionId: string; // DB session UUID (for revocation)
}

// @CurrentUser() decorator for all authenticated routes
export const CurrentUser = createParamDecorator(
  (_data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    const user = request.user;
    return _data ? user?.[_data] : user;
  },
);
