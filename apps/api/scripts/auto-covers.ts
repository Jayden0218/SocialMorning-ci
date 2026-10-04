// One-time: gives every Studio show that has no cover the made-for-you tile.
/**
 * Owner, 2026-10-04. New shows get the tile when they are made (`createHostedShow`); this fills
 * in the shows made before that. Run once against the production database:
 *
 *   DATABASE_URL=… PUBLIC_API_URL=https://socialmorning-api.vercel.app npx tsx scripts/auto-covers.ts
 *
 * It prints how many shows changed and nothing else (no names, no addresses). Running it twice
 * changes nothing the second time.
 */
import postgres from 'postgres';
import { autoCoverUrl } from '@socialmorning/social-core';

const base = process.env['PUBLIC_API_URL'] ?? 'https://socialmorning-api.vercel.app';
const sql = postgres(process.env['DATABASE_URL']!, { ssl: 'require', onnotice: () => {} });

const rows = await sql<{ id: string; feed_url: string; title: string }[]>`
  SELECT id, feed_url, title FROM hosted_shows WHERE cover_url IS NULL AND deleted_at IS NULL`;
for (const r of rows) {
  const url = autoCoverUrl(base, r.title);
  await sql.begin(async (tx) => {
    await tx`UPDATE hosted_shows SET cover_url = ${url}, updated_at = now() WHERE id = ${r.id} AND cover_url IS NULL`;
    // The app's own episode rows carry the show's cover where the episode has none.
    await tx`UPDATE episodes SET image_url = ${url} WHERE feed_url = ${r.feed_url} AND image_url IS NULL`;
  });
}
console.log(`shows given the made-for-you cover: ${rows.length}`);
await sql.end();
