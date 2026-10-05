// Removes the demo account, its 6 helpers and everything scripts/seed-demo.ts wrote for them.
/**
 *   cd apps/api && npx tsx scripts/unseed-demo.ts      (DATABASE_URL from apps/api/.env)
 *
 * Deletes only the emails in DEMO_ACCOUNTS. Content is cleared first (a demo comment a real
 * listener replied to becomes a placeholder, as a real delete would — comments do not cascade),
 * then the accounts (sessions, follows by real listeners, chats, daily_active … cascade), then
 * the heat curves of the touched episodes are rebuilt and apps/api/.env.demo-account is removed.
 * Running it twice changes nothing the second time.
 */
import { existsSync, unlinkSync } from 'node:fs';
import postgres from 'postgres';
import { fromPostgres } from '../src/db/db.ts';
import { rebuildEpisodeHeat } from '../src/heat/rebuild.ts';
import { DEMO_ACCOUNTS, LOGIN_FILE, clearContent, loadEnv } from './seed-demo.ts';

loadEnv();
const sql = postgres(process.env['DATABASE_URL']!, { ssl: 'require', max: 1, onnotice: () => {} });
const db = fromPostgres(sql);
try {
  const emails = DEMO_ACCOUNTS.map((a) => a.email);
  const rows = await db.query<{ id: string }>('SELECT id FROM listeners WHERE email = ANY($1::citext[])', [emails]);
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) {
    console.log('No demo accounts found; nothing to remove.');
  } else {
    const touched = await clearContent(db, ids);
    // Chats with real listeners, follows by real listeners, sessions … go with the account (ON DELETE CASCADE).
    const gone = await db.query('DELETE FROM listeners WHERE id = ANY($1::uuid[]) RETURNING id', [ids]);
    for (const e of touched) await rebuildEpisodeHeat(db, e);
    console.log(`Removed ${gone.length} demo accounts and their content; rebuilt heat on ${touched.length} episodes.`);
  }
  if (existsSync(LOGIN_FILE)) { unlinkSync(LOGIN_FILE); console.log('Removed apps/api/.env.demo-account.'); }
} finally {
  await sql.end();
}
