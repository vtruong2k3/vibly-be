import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export const SKIP_TRANSFORM = 'skipTransform';

// Global success envelope: { success: true, data: ..., meta: ... }
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TRANSFORM, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skip) return next.handle();

    return next.handle().pipe(
      map((data) => {
        // Allow services to pass { data, meta } explicitly for pagination
        if (
          data &&
          typeof data === 'object' &&
          'data' in data &&
          'meta' in data
        ) {
          return { success: true, ...data };
        }
        return { success: true, data };
      }),
    );
  }
}
