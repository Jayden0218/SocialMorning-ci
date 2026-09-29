import { defineConfig } from '@playwright/test';

/** The Studio end to end: a real browser against `vite preview` (which proxies /api like production) and the real API. */
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: { baseURL: 'http://localhost:4173', screenshot: 'on', trace: 'retain-on-failure', viewport: { width: 1280, height: 860 } },
  outputDir: 'e2e-results',
});
