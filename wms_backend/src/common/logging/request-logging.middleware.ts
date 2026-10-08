/**
 * One request id per request, one access-log line per response, and the counters `/v1/metrics`
 * reports. Installed in `configure-app.ts` so tests and the running service behave identically.
 *
 * The id comes from an inbound `X-Request-Id` when a proxy already set one, otherwise it is
 * generated. It goes back out on the response so a support conversation ("it failed at 14:05")
 * can be turned into a log query, and `ProblemDetailsFilter` puts it in the refusal body.
 *
 * The line carries method, route, status, duration and the actor's **id** — never the path's
 * query string, body, headers, or any name or email.
 */

import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { log, runWithRequestContext } from './logger';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Path shapes, not ids: `/v1/registration-entries/<uuid>` counts as one route, not thousands. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function routeShape(path: string): string {
  return path.split('?')[0]!.replace(UUID, ':id');
}

export type RouteMetrics = {
  requests: number;
  byStatusClass: Record<string, number>;
  byRoute: Record<string, { count: number; totalMs: number; errors: number }>;
  slowestMs: number;
  startedAt: string;
};

const metrics: RouteMetrics = {
  requests: 0,
  byStatusClass: {},
  byRoute: {},
  slowestMs: 0,
  startedAt: new Date().toISOString(),
};

export function readMetrics(): RouteMetrics {
  return {
    ...metrics,
    byStatusClass: { ...metrics.byStatusClass },
    byRoute: Object.fromEntries(
      Object.entries(metrics.byRoute).map(([route, value]) => [route, { ...value }]),
    ),
  };
}

/** Tests need a clean slate; nothing in the running service calls this. */
export function resetMetrics(): void {
  metrics.requests = 0;
  metrics.byStatusClass = {};
  metrics.byRoute = {};
  metrics.slowestMs = 0;
  metrics.startedAt = new Date().toISOString();
}

function record(route: string, status: number, durationMs: number): void {
  metrics.requests += 1;
  const statusClass = `${Math.floor(status / 100)}xx`;
  metrics.byStatusClass[statusClass] = (metrics.byStatusClass[statusClass] ?? 0) + 1;
  const entry = (metrics.byRoute[route] ??= { count: 0, totalMs: 0, errors: 0 });
  entry.count += 1;
  entry.totalMs += durationMs;
  if (status >= 500) entry.errors += 1;
  if (durationMs > metrics.slowestMs) metrics.slowestMs = durationMs;
}

export function requestLogging(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.headers[REQUEST_ID_HEADER];
  const requestId = (Array.isArray(inbound) ? inbound[0] : inbound)?.slice(0, 64) || randomUUID();
  res.setHeader('X-Request-Id', requestId);

  runWithRequestContext({ requestId }, () => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const route = routeShape(req.originalUrl ?? req.url);
      record(route, res.statusCode, durationMs);
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      log[level]('request', {
        method: req.method,
        route,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
      });
    });
    next();
  });
}
