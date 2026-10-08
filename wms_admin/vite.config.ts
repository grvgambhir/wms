import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // @wms/domain is a file:-linked sibling repo outside this project root.
    preserveSymlinks: true,
  },
  // NOTE: do NOT add @wms/domain to optimizeDeps.exclude. It is compiled to
  // CommonJS, so Vite's dependency pre-bundling is what converts it to ESM and
  // makes its named exports resolvable in the browser; excluding it produces
  // "does not provide an export named X" at runtime. The flip side is that the
  // optimizer caches the result in node_modules/.vite/deps and only invalidates
  // on package.json/lockfile changes — which a rebuilt sibling package does not
  // touch — so the dev script runs `vite --force` to re-optimize every start.
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
