/**
 * One-line JSON logs with a request id on every line.
 *
 * Until now the service used bare `console.log`: no level, no timestamp, no way to tie two lines
 * to the same request, and nothing a log system could filter. A hosted service needs at least
 * that much before anyone can be asked to operate it.
 *
 * Deliberately dependency-free — pino would be the obvious choice, but this is ~60 lines, has no
 * install step, and writes the same shape (`level`, `time`, `msg`, plus fields). If a log pipeline
 * later wants pino's ecosystem, swap the `write` below and nothing else changes.
 *
 * **Never log personal data.** Log ids (person id, entry id), never names, emails, dates of birth,
 * evidence contents or tokens. `redact()` is applied to every field as a backstop, not as
 * permission to pass secrets in.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from '../../config/env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type RequestContext = {
  requestId: string;
  /** The authenticated person, once the auth guard has resolved one. Never their email or name. */
  actorId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Attach the authenticated person to the in-flight request's log lines. */
export function setRequestActor(actorId: string): void {
  const store = storage.getStore();
  if (store) store.actorId = actorId;
}

const SECRET_KEY = /(password|secret|token|authorization|cookie|key)/i;

function redact(value: unknown, key?: string): unknown {
  if (key && SECRET_KEY.test(key)) return '[redacted]';
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redact(v, k)]),
    );
  }
  return value;
}

const threshold = LEVELS[(env.LOG_LEVEL as LogLevel) ?? 'info'] ?? LEVELS.info;

function write(level: LogLevel, msg: string, fields: Record<string, unknown>): void {
  if (LEVELS[level] < threshold) return;
  const context = storage.getStore();
  const line = {
    level,
    time: new Date().toISOString(),
    msg,
    requestId: context?.requestId,
    actorId: context?.actorId,
    ...(redact(fields) as Record<string, unknown>),
  };
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify(line)}\n`);
}

export const log = {
  debug: (msg: string, fields: Record<string, unknown> = {}) => write('debug', msg, fields),
  info: (msg: string, fields: Record<string, unknown> = {}) => write('info', msg, fields),
  warn: (msg: string, fields: Record<string, unknown> = {}) => write('warn', msg, fields),
  error: (msg: string, fields: Record<string, unknown> = {}) => write('error', msg, fields),
};
