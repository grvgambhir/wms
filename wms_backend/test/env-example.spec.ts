/**
 * `.env.example` is the contract for a bootable local environment. Its key
 * list comes from env.ts, so a newly declared config variable cannot be added
 * without documenting it here.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { environmentVariableNames } from '../src/config/env';

const exampleLines = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8').split(/\r?\n/);

function templateLine(key: string): number {
  const expression = new RegExp(`^\\s*(?:#\\s*)?${key}=`, 'u');
  return exampleLines.findIndex((line) => expression.test(line));
}

function hasExplanationBefore(lineIndex: number): boolean {
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const line = exampleLines[index]?.trim() ?? '';
    if (line === '') return false;
    if (!line.startsWith('#')) return false;
    // A commented-out assignment is a placeholder, not its own explanation.
    if (!/^#\s*[A-Z][A-Z0-9_]*=/.test(line)) return true;
  }
  return false;
}

describe('.env.example', () => {
  it.each(environmentVariableNames)('documents %s with an explanatory comment', (key) => {
    const lineIndex = templateLine(key);
    expect(lineIndex, `${key} is missing from .env.example`).toBeGreaterThanOrEqual(0);
    expect(hasExplanationBefore(lineIndex), `${key} needs an explanatory comment`).toBe(true);
  });
});
