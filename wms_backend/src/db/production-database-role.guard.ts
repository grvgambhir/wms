/**
 * A production process must never run with a database superuser. Superusers
 * bypass every table grant, which would silently defeat the app_rw boundary.
 */
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { log } from '../common/logging/logger';
import { env } from '../config/env';
import { pool } from './pool';

type RoleQuery = {
  query: <T extends Record<string, unknown>>(sql: string) => Promise<{ rows: T[] }>;
};

export async function assertProductionDatabaseRoleIsNotSuperuser(
  database: RoleQuery,
  nodeEnv: string,
): Promise<void> {
  const result = await database.query<{ isSuperuser: boolean; role: string }>(
    'SELECT rolsuper AS "isSuperuser", rolname AS role FROM pg_roles WHERE rolname = current_user',
  );
  const role = result.rows[0];

  if (nodeEnv !== 'production') {
    // Development ran as the owner for months, which silently disabled every grant in the schema
    // — including the one keeping `restricted.*` away from the application. Say so at startup
    // rather than only refusing in production, where it would be found far too late.
    if (role?.isSuperuser) {
      log.warn('database role is a superuser: every GRANT in the schema is bypassed', {
        role: role.role,
        hint: 'point DATABASE_URL at app_rw and keep the owner in DATABASE_OWNER_URL',
      });
    }
    return;
  }

  if (!role) {
    throw new Error('Unable to determine whether the configured database role is a superuser.');
  }
  if (role.isSuperuser) {
    throw new Error(
      'Refusing to start in production with a database superuser. Configure DATABASE_URL with the least-privilege application role.',
    );
  }
}

@Injectable()
export class ProductionDatabaseRoleGuard implements OnApplicationBootstrap {
  async onApplicationBootstrap(): Promise<void> {
    await assertProductionDatabaseRoleIsNotSuperuser(pool, env.NODE_ENV);
  }
}
