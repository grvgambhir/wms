/**
 * Liveness and readiness. /v1/health always hits the database; /v1/ready
 * additionally requires migrations to be at the latest version.
 */
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { readMetrics, type RouteMetrics } from '../common/logging/request-logging.middleware';
import { buildInfo } from '../config/build-info';
import { env } from '../config/env';
import { OC_ROLE_CODES } from '../people/profile.schema';
import { getMigrationStatus } from '../db/migrations';
import { pool } from '../db/pool';

type HealthBody = {
  ok: true;
  version: string;
  gitSha: string | null;
  /** Identifies the deployed build even without a Git checkout; null in an unbuilt source tree. */
  buildId: string | null;
  builtAt: string | null;
  db: 'ok';
  migrations?: 'latest';
};

@Public()
@Controller()
export class HealthController {
  @Get('health')
  async health(): Promise<HealthBody> {
    await this.selectOne();
    return this.baseBody();
  }

  @Get('ready')
  async ready(): Promise<HealthBody> {
    await this.selectOne();
    const status = await getMigrationStatus(pool);
    if (!status.latest) {
      console.log('Ready check failed: pending migrations', status.pending.join(','));
      throw new ServiceUnavailableException({
        ok: false,
        version: env.VERSION,
        gitSha: env.GIT_SHA ?? null,
        db: 'ok',
        migrations: 'pending',
        pending: status.pending,
      });
    }
    return { ...this.baseBody(), migrations: 'latest' };
  }

  private async selectOne(): Promise<void> {
    try {
      await pool.query('SELECT 1');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log('Health check failed:', message);
      throw new ServiceUnavailableException({
        ok: false,
        version: env.VERSION,
        gitSha: env.GIT_SHA ?? null,
        db: 'unreachable',
      });
    }
  }

  private baseBody(): HealthBody {
    return {
      ok: true,
      version: buildInfo.version,
      gitSha: buildInfo.gitSha,
      buildId: buildInfo.buildId,
      builtAt: buildInfo.builtAt,
      db: 'ok',
    };
  }
}

/**
 * What this process has served since it started: request counts by status class, per-route counts
 * with average duration, and 5xx counts. In-process and therefore reset by a restart — enough to
 * answer "is anything failing, and what is slow" without a metrics stack, and the shape a real
 * exporter would read later.
 *
 * OC-only: route shapes and error rates are operational detail, not public.
 */
@Controller()
export class MetricsController {
  @Get('metrics')
  @Roles(...OC_ROLE_CODES)
  read(): RouteMetrics & { uptimeSeconds: number } {
    return { ...readMetrics(), uptimeSeconds: Math.round(process.uptime()) };
  }
}
