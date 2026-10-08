/**
 * Shared Nest bootstrap (prefix + ValidationPipe) so tests and main.ts stay in lockstep.
 */
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { ProblemDetailsFilter } from './common/http/problem-details.filter';
import { requestLogging } from './common/logging/request-logging.middleware';

const LOCAL_WEB_ORIGINS = [
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export function configureApp(app: INestApplication): void {
  // First in the chain: everything after it, including the error filter, can read the request id.
  app.use(requestLogging);
  app.enableCors({
    origin: LOCAL_WEB_ORIGINS,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'Accept', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });
  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
