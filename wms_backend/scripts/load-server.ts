import type { INestApplication, LoggerService } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { AccreditationModule } from '../src/accreditation/accreditation.module';
import { AuthGuard } from '../src/auth/guards/auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import {
  IDENTITY_PROVIDER,
  InvalidTokenError,
  type AuthenticatedIdentity,
  type IdentityProvider,
  type TokenPair,
} from '../src/auth/identity/identity-provider';
import { configureApp } from '../src/configure-app';
import { closeDb } from '../src/db/pool';
import { EvidenceModule } from '../src/evidence/evidence.module';
import { PeopleModule } from '../src/people/people.module';
import { RegistrationModule } from '../src/registration/registration.module';
import { RosterModule } from '../src/roster/roster.module';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class LoadIdentityProvider implements IdentityProvider {
  authenticate(): Promise<AuthenticatedIdentity | null> {
    return Promise.resolve(null);
  }

  issue(): Promise<TokenPair> {
    throw new InvalidTokenError();
  }

  verify(accessToken: string): Promise<AuthenticatedIdentity> {
    try {
      const [prefix, encoded, extra] = accessToken.split('.');
      if (prefix !== 'load' || !encoded || extra !== undefined) throw new InvalidTokenError();
      const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
        personId?: unknown;
        roles?: unknown;
      };
      if (
        typeof parsed.personId !== 'string' ||
        !UUID_RE.test(parsed.personId) ||
        !Array.isArray(parsed.roles) ||
        !parsed.roles.every((role) => typeof role === 'string')
      ) {
        throw new InvalidTokenError();
      }
      return Promise.resolve({ personId: parsed.personId, roles: parsed.roles as string[] });
    } catch (error) {
      if (error instanceof InvalidTokenError) throw error;
      throw new InvalidTokenError();
    }
  }

  refresh(): Promise<TokenPair> {
    throw new InvalidTokenError();
  }

  revoke(): Promise<void> {
    return Promise.resolve();
  }
}

class LoadLogger implements LoggerService {
  log(): void {}
  warn(): void {}
  debug(): void {}
  verbose(): void {}

  error(message: unknown, ...optionalParams: unknown[]): void {
    const rendered = [message, ...optionalParams]
      .map((value) => (value instanceof Error ? (value.stack ?? value.message) : String(value)))
      .join(' ');
    process.stderr.write(`LOAD_SERVER_ERROR ${rendered}\n`);
  }
}

@Module({
  imports: [PeopleModule, RegistrationModule, EvidenceModule, RosterModule, AccreditationModule],
  providers: [
    { provide: IDENTITY_PROVIDER, useClass: LoadIdentityProvider },
    AuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
class LoadModule {}

async function main(): Promise<void> {
  const app = await NestFactory.create(LoadModule, { logger: new LoadLogger() });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  process.stdout.write(`LOAD_SERVER_READY ${await app.getUrl()}\n`);
  installShutdown(app);
}

function installShutdown(app: INestApplication): void {
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    void app
      .close()
      .then(() => closeDb())
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        process.stderr.write(`LOAD_SERVER_ERROR shutdown ${String(error)}\n`);
        process.exit(1);
      });
  };
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `LOAD_SERVER_ERROR boot ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
