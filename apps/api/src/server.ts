import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createClient } from './db/client.ts';
import { fromPostgres } from './db/db.ts';

const pepper = process.env.SESSION_PEPPER;
if (!pepper) throw new Error('SESSION_PEPPER is not set (apps/api/.env — see .env.example)');

const app = createApp({ db: fromPostgres(createClient()), pepper, ...(process.env['ASSETLINKS_SHA256'] ? { assetLinksSha256: process.env['ASSETLINKS_SHA256'] } : {}) });
const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => {
  console.log(`api listening on :${port}`);
});
