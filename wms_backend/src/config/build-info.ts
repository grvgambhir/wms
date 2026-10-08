/**
 * What is actually running here. Written by `scripts/write-build-info.mjs` during `npm run build`
 * and read once at startup; a source checkout that was never built reports `buildId: null` instead
 * of a made-up value.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from './env';

export type BuildInfo = {
  buildId: string | null;
  version: string;
  gitSha: string | null;
  builtAt: string | null;
};

function read(): BuildInfo {
  for (const candidate of [
    join(__dirname, '..', 'build-info.json'), // dist/build-info.json next to compiled code
    join(__dirname, '..', '..', 'dist', 'build-info.json'), // running from src via tsx
  ]) {
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as Partial<BuildInfo>;
      if (parsed.buildId) {
        return {
          buildId: parsed.buildId,
          version: parsed.version ?? env.VERSION,
          gitSha: parsed.gitSha ?? env.GIT_SHA ?? null,
          builtAt: parsed.builtAt ?? null,
        };
      }
    } catch {
      // Try the next location; a missing stamp is reported honestly below.
    }
  }
  return { buildId: null, version: env.VERSION, gitSha: env.GIT_SHA ?? null, builtAt: null };
}

export const buildInfo: BuildInfo = read();
