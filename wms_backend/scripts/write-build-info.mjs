/**
 * Stamps the build so a running instance can be identified.
 *
 * `gitSha` has always been null in this service, because `wms_backend` is not a Git checkout —
 * which left no way at all to tell which build is deployed. The build writes `build-info.json`
 * next to the compiled output: a git sha when one exists, the package version, the build time,
 * and a short `buildId` derived from them. `GET /v1/health` returns it.
 *
 * Run automatically by `npm run build`. A source checkout that was never built reports
 * `buildId: null` rather than pretending.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function gitSha() {
  if (process.env.GIT_SHA) return process.env.GIT_SHA;
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const builtAt = new Date().toISOString();
const sha = gitSha();
const buildId = createHash('sha256')
  .update(`${version}:${sha ?? 'no-git'}:${builtAt}`)
  .digest('hex')
  .slice(0, 12);

const target = join(root, 'dist', 'build-info.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify({ buildId, version, gitSha: sha, builtAt }, null, 2)}\n`);
console.log(`build-info: ${buildId} (version ${version}, git ${sha ?? 'none'})`);
