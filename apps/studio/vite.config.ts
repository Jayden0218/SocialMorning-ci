/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The one colour source is the app's tokens file (research R9); it has no imports, so the
// Studio reads it directly and turns it into CSS variables (src/tokens.ts).
const tokens = fileURLToPath(new URL('../mobile/src/design/tokens.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@tokens': tokens } },
  server: {
    // Same shape as production: the browser only talks to its own host; /api goes to the API.
    proxy: { '/api': { target: 'http://localhost:8787', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
  test: { environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'], setupFiles: ['test/setup.ts'] },
});
