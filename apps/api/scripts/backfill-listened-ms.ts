// One-time: fills listeners.listened_ms (the comment badge's total) from the listening ranges.
/**
 * M21 US6 (T072, guard G-M21-12). From migration 019 on, `replaceRanges()` keeps `listened_ms`
 * current by adding what the union gained. This fills in the listening done before that. Run once
 * against the production database:
 *
 *   DATABASE_URL=… npx tsx scripts/backfill-listened-ms.ts
 *
 * For each listener it takes, per (episode, day), the UNION of every device's ranges — the same
 * helper `replaceRanges()` uses — never a SQL SUM, which would count two phones playing the same
 * minute twice. It SETS the total (so running it twice changes nothing the second time), inside a
 * transaction that holds the listener's row. It prints counts only — no names, no addresses.
 */
import postgres from 'postgres';
import { unionOfRows } from '../src/db/repos/library/listened.ts';

const sql = postgres(process.env['DATABASE_URL']!, { ssl: 'require', onnotice: () => {} });

const ids = await sql<{ listener_id: string }[]>`SELECT DISTINCT listener_id FROM listened_ranges`;
let changed = 0;
let unchanged = 0;
let totalMs = 0;
for (const { listener_id: id } of ids) {
  const r = await sql.begin(async (tx) => {
    const [me] = await tx<{ listened_ms: string | number }[]>`SELECT listened_ms FROM listeners WHERE id = ${id} FOR UPDATE`;
    if (!me) return 'gone' as const;
    const rows = await tx<{ episode_id: string; day: string; ranges: unknown }[]>`
      SELECT episode_id, day::text AS day, ranges FROM listened_ranges WHERE listener_id = ${id}`;
    const byKey = new Map<string, { ranges: never }[]>();
    for (const row of rows) {
      const key = `${row.episode_id}\u0000${row.day}`;
      byKey.set(key, [...(byKey.get(key) ?? []), { ranges: row.ranges as never }]);
    }
    let ms = 0;
    for (const set of byKey.values()) ms += unionOfRows(set);
    ms = Math.max(0, Math.round(ms));
    totalMs += ms;
    if (Number(me.listened_ms) === ms) return 'same' as const;
    await tx`UPDATE listeners SET listened_ms = ${ms} WHERE id = ${id}`;
    return 'set' as const;
  });
  if (r === 'set') changed++;
  else if (r === 'same') unchanged++;
}
console.log(`listeners with listening ranges: ${ids.length}`);
console.log(`listened_ms set: ${changed}, already right: ${unchanged}`);
console.log(`total hours across them: ${Math.round(totalMs / 3_600_000)}`);
await sql.end();
