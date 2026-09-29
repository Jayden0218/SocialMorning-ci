/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The one colour source is the app's tokens file (research R9). It is loaded as a virtual
 * module compiled by TypeScript itself: left to Vite, the file would be transformed with the
 * closest tsconfig — the app's, which extends `expo/tsconfig.base` and fails to load here
 * (cloud run 36507406161).
 */
const TOKENS = fileURLToPath(new URL('../mobile/src/design/tokens.ts', import.meta.url));
const VIRTUAL = '\0sm-app-tokens';
function appTokens(): Plugin {
  return {
    name: 'sm-app-tokens',
    enforce: 'pre',
    resolveId: (source) => (source === '@tokens' ? VIRTUAL : null),
    load(id) {
      if (id !== VIRTUAL) return null;
      this.addWatchFile(TOKENS);
      return ts.transpileModule(readFileSync(TOKENS, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
    },
  };
}

export default defineConfig({
  plugins: [appTokens(), react()],
  server: {
    // Same shape as production: the browser only talks to its own host; /api goes to the API.
    proxy: { '/api': { target: 'http://localhost:8787', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
  test: { environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'], setupFiles: ['test/setup.ts'] },
});
