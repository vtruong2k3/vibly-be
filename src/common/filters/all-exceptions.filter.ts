import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

// OWASP: All errors return consistent { success:false, error:{ code, message } }
// Never expose stack traces in production
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        code = this.resolveCode(statusCode);
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const exObj = exceptionResponse as Record<string, unknown>;
        message = (exObj.message as string) ?? message;
        code = (exObj.code as string) ?? this.resolveCode(statusCode);
        // Validation errors (array of messages from class-validator)
        if (Array.isArray(exObj.message)) {
          message = (exObj.message as string[]).join('; ');
          code = 'VALIDATION_ERROR';
        }
      }
    }

    const isExpectedSilentRefresh401 = statusCode === 401 && request.url.includes('/auth/refresh');

    if (!isExpectedSilentRefresh401) {
      this.logger.warn(
        `${request.method} ${request.url} → ${statusCode} [${code}]: ${message}`,
      );
    }

    // Never debug info in prod
    if (statusCode >= 500 && process.env.NODE_ENV !== 'production') {
      this.logger.error(exception);
    }

    response.status(statusCode).json({
      success: false,
      error: {
        code,
        message,
        // Only in dev:
        ...(process.env.NODE_ENV !== 'production' && statusCode >= 500
          ? { details: String(exception) }
          : {}),
      },
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private resolveCode(status: number): string {
    const codes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
    };
    return codes[status] ?? 'ERROR';
  }
}
