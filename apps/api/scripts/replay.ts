/**
 * M8 Tier C (L8) — the offline replay (research R9).
 *
 * Hide what a listener actually went on to play, drop it into a field of random episodes,
 * and ask the ranker to order the lot. Report the median position of the hidden ones.
 *
 * **Read the caveats before quoting the number.**
 *
 *  1. It rewards predicting what someone already chose. That is not the same as helping
 *     them find something new, which is the thing the product exists to do. A recommender
 *     that only ever returned episodes of shows you already subscribe to would score
 *     beautifully here and be worthless.
 *  2. `affinity` is the largest term in the score and `subscribed` is most of it, so on a
 *     listener whose history is all from subscribed shows this measures little more than
 *     "did they listen to a show they subscribe to".
 *  3. With a handful of held-out episodes the median is a median of a handful of numbers.
 *
 * It is still worth running: it turns "the ordering got worse" from an opinion into a
 * number. It is not worth believing on its own.
 *
 *   npm run replay -w apps/api -- [displayName] [days]
 */
import postgres from 'postgres';
import { replayScore, REPLAY_FIELD, REPLAY_TARGET_PERCENTILE, scoreCandidate, type RecCandidate } from '@socialmorning/social-core';

const name = process.argv[2] ?? 'J4';
const days = Number(process.argv[3] ?? 30);
const sql = postgres(process.env['DATABASE_URL']!, { ssl: 'require', onnotice: () => {} });

const [me] = await sql`select id from listeners where display_name = ${name} limit 1`;
if (!me) { console.error(`no listener called ${name}`); process.exit(1); }

const heldOut = (await sql`
  select distinct a.episode_id from activity a
  where a.actor_id = ${me.id} and a.kind = 'listened' and a.created_at > now() - (${String(days)} || ' days')::interval
`).map((r: { episode_id: string }) => r.episode_id);

const subs = new Set((await sql`select feed_url from subscriptions where listener_id = ${me.id} and deleted_at is null`).map((r: { feed_url: string }) => r.feed_url));

const field = await sql`
  select id, feed_url, genre_id, published_at from episodes
  where id <> all(${heldOut.length > 0 ? heldOut : ['']}::text[])
  order by random() limit ${REPLAY_FIELD}`;
const held = await sql`select id, feed_url, genre_id, published_at from episodes where id = any(${heldOut.length > 0 ? heldOut : ['']}::text[])`;

const now = Date.now();
const toCandidate = (e: { id: string; feed_url: string; genre_id: number | null; published_at: string | null }): RecCandidate => ({
  episodeId: e.id, feedUrl: e.feed_url, genreId: e.genre_id, channel: 'talked',
  publishedAt: e.published_at === null ? null : new Date(e.published_at).getTime(),
  subscribed: subs.has(e.feed_url), neighbourSim: 0, genreMatch: false,
  socialCount: 0, talkedScore: 0, impressions: 0,
});

const all = [...held, ...field].map(toCandidate);
const ranked = all
  .map((c) => ({ id: c.episodeId, s: scoreCandidate(c, now) }))
  .sort((a, b) => b.s - a.s)
  .map((x) => x.id);

const score = replayScore(ranked, held.map((e: { id: string }) => e.id));
console.log(`listener        : ${name}`);
console.log(`held out        : ${held.length} episodes from the last ${days} days`);
console.log(`field           : ${field.length} random episodes`);
console.log(`median percentile: ${score.toFixed(3)}  (target ≤ ${REPLAY_TARGET_PERCENTILE})`);
console.log(`verdict         : ${score <= REPLAY_TARGET_PERCENTILE ? 'within target' : 'OUTSIDE target'}`);
console.log(`\nn = ${held.length}. Below about 20 held-out episodes this number is not worth`);
console.log(`quoting as evidence of anything; see the caveats at the top of this file.`);
await sql.end();
