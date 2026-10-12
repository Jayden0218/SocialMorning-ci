/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// M27 FR-047: the API the Studio proxies /api to. Dev (`vite`) defaults to the dev API's port (scripts/dev-ddb.sh serves :3000);
// `vite preview` is what the end-to-end run uses against scripts/e2e-server.ts on :8787 (ci/workflows/e2e.yml sets API_URL).
const rewrite = (p: string) => p.replace(/^\/api/, '');
const target = (fallback: string) => process.env['API_URL'] ?? fallback;

export default defineConfig({
  plugins: [react()],
  server: {
    // Same shape as production: the browser only talks to its own host; /api goes to the API.
    proxy: { '/api': { target: target('http://localhost:3000'), rewrite } },
  },
  // The end-to-end test runs the BUILT Studio with `vite preview`; it proxies /api the same way.
  preview: {
    proxy: { '/api': { target: target('http://localhost:8787'), rewrite } },
  },
  test: { environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'], setupFiles: ['test/setup.ts'] },
});
