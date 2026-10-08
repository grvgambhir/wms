import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    globalSetup: ['test/globalSetup.ts'],
    fileParallelism: false,
    sequence: { concurrent: false },
    maxWorkers: 1,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
  // @wms/domain is a file: symlink to ../wms_domain. Vitest otherwise tries to
  // re-transform its already-compiled dist/ (same hazard as Jest/Vite in the
  // sibling apps). Inline it so the built CommonJS is used as-is.
  server: {
    deps: {
      inline: [/@wms\/domain/, /wms_domain/],
    },
  },
});
