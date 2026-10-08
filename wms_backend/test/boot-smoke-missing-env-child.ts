/** Executed in a child process by boot-smoke.spec.ts with no .env file. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

async function main(): Promise<void> {
  // Re-throw initialization errors so the parent test can assert the exact
  // boot refusal instead of Nest aborting the child process without output.
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await app.close();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
