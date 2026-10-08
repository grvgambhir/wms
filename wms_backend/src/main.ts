/**
 * Process bootstrap: global prefix /v1, ValidationPipe, shutdown hooks.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { buildInfo } from './config/build-info';
import { log } from './common/logging/logger';
import { env } from './config/env';

// argon2 has no Node 20 prebuild for darwin-arm64 and SEGFAULTS on require — exit code 139,
// no stack, no message. Fail with a sentence instead.
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  console.error(
    `Node ${process.versions.node} is not supported. This service needs Node 22+ ` +
      `(argon2 segfaults on Node 20, and Node 20 reached end-of-life in April 2026).`,
  );
  process.exit(1);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(env.PORT);
  log.info('listening', {
    port: env.PORT,
    env: env.NODE_ENV,
    buildId: buildInfo.buildId,
    version: buildInfo.version,
    gitSha: buildInfo.gitSha,
  });
}

void bootstrap();
