import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  ClassSerializerInterceptor,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RedisIoAdapter } from './common/adapters/redis-io.adapter';

import cookieParser from 'cookie-parser';
import { LoggingInterceptor } from 'src/common/interceptors/logging.interceptor';

// ─── Process-level error guards ──────────────────────────────────────────────
// Redis (and BullMQ) occasionally emit transient socket errors ('SocketClosedUnexpectedlyError')
// that bubble as unhandled `error` events. Without this guard the Node process crashes.
const TRANSIENT_ERRORS = new Set([
  'SocketClosedUnexpectedlyError',
  'ERR_SOCKET_CLOSED',
  'ECONNRESET',
  'ECONNREFUSED',
]);

process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (TRANSIENT_ERRORS.has(err.name) || TRANSIENT_ERRORS.has(err.code ?? '')) {
    console.warn('[Process] Transient infrastructure error (Redis/BullMQ) — ignored:', err.message);
    return; // keep the process alive; the Redis client will reconnect automatically
  }
  console.error('[Process] Uncaught exception — exiting:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  if (TRANSIENT_ERRORS.has(err.name)) {
    console.warn('[Process] Transient unhandled rejection (Redis/BullMQ) — ignored:', err.message);
    return;
  }
  console.error('[Process] Unhandled rejection — exiting:', err);
  process.exit(1);
});

async function bootstrap() {

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // Setup Redis Adapter for WebSockets
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // Security: HTTP Headers
  app.use(helmet());

  // Cookie parser for HttpOnly refresh token cookie
  app.use(cookieParser());

  // API Prefix & Versioning
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // CORS
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? [
      'http://localhost:3000',
      'http://localhost:3001',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  });

  const reflector = app.get(Reflector);

  // Global Pipes — transform:true, whitelist:true, forbidNonWhitelisted:true (Plan requirement)
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global Filters — OWASP: consistent error shape { success:false, error: { code, message } }
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global Interceptors — consistent success shape { success:true, data, meta }
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ResponseInterceptor(reflector),
    new ClassSerializerInterceptor(reflector),
  );

  // Swagger — always active (Plan principle #5: Swagger từ ngày 1)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Vibly Social API')
      .setDescription('Vibly Social Platform REST API')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .addCookieAuth('__Host-refresh')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = process.env.PORT ?? 8000;
  await app.listen(port);

  console.log(`🚀 Vibly API running on: http://localhost:${port}/api/v1`);
  console.log(`📚 Swagger Docs: http://localhost:${port}/api/docs`);
}
bootstrap();
