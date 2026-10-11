// The copy test's base fixture on Postgres: ten listeners and the episodes of six feeds, with fixed ids, then each lane's rows.
/**
 * M26 lane MIG (test/ddb-mig.test.ts). Plain SQL on purpose: this is "the old database" the copy reads, written the
 * way years of production wrote it (NULLs, soft deletes, old rows), not through today's code. Each lane's file
 * `test/mig-seed-<lane>.ts` adds its tables on top (`seed(b)`), so that every table of the database has rows.
 * Times are relative to `now` (the test's real time): the 7/14/30-day windows and the 24-hour statuses have content.
 */
import type { Db } from '../src/db/db.ts';
import { episodeIdOf } from '../src/catalog/feed.ts';

/** Fixed listener ids (uuid v4 shape). `alex` is the owner / admin. */
export const L = {
  alex: '00000000-0000-4000-8000-00000000000a', // owner, admin
  bea: '00000000-0000-4000-8000-00000000000b',
  cy: '00000000-0000-4000-8000-00000000000c',
  dee: '00000000-0000-4000-8000-00000000000d', // private listening, likes not public
  eli: '00000000-0000-4000-8000-00000000000e',
  fay: '00000000-0000-4000-8000-00000000000f',
  gus: '00000000-0000-4000-8000-000000000010',
  hal: '00000000-0000-4000-8000-000000000011', // suspended
  ivy: '00000000-0000-4000-8000-000000000012', // hidden
  jo: '00000000-0000-4000-8000-000000000013', // deletion pending
} as const;
export type Who = keyof typeof L;

/** The demo seed's feeds (scripts/seed-demo.ts FEEDS) plus one Studio-made feed. */
export const FEEDS = {
  pi: 'https://feeds.simplecast.com/BqbsxVfO',
  stoic: 'https://feeds.acast.com/public/shows/6abacdd76ffb28f8d6775e00',
  bbc: 'https://podcasts.files.bbci.co.uk/p02pc9tn.rss',
  daily: 'https://feeds.simplecast.com/Sl5CSM3S',
  upfirst: 'https://feeds.npr.org/510318/podcast.xml',
  fresh: 'https://feeds.npr.org/381444908/podcast.xml',
} as const;
export type FeedKey = keyof typeof FEEDS;

export type Ep = { key: string; id: string; feed: FeedKey; feedUrl: string; guid: string; title: string; durationMs: number | null; publishedAt: Date | null; genreId: number | null; mediaKind: 'audio' | 'video' };

/** [key, feed, title, minutes long (null = unknown), hours since published (null = no date), genre, kind] */
const EPS: [string, FeedKey, string, number | null, number | null, number | null, 'audio' | 'video'][] = [
  // the demo seed looks these up by exact title (scripts/seed-demo.ts EPISODES)
  ['rocky', 'pi', 'The Rocky Statue', 32, 300, 1301, 'audio'],
  ['phone', 'pi', '100 Objects #19: Western Electric 500 Series', 28, 200, 1301, 'audio'],
  ['bamboo', 'pi', 'Bamboo Is Innocent', 41, 150, 1301, 'audio'],
  ['tootle', 'pi', 'Tootle of a Devilish Song', 36, 90, 1301, 'audio'],
  ['rules', 'stoic', '50 Stoic Rules to Live By', 22, 260, 1304, 'audio'],
  ['wisdom', 'stoic', 'Do You Know Where to Find It? | Why Does Ancient Wisdom Still Surprise', 9, 100, 1304, 'audio'],
  ['joy', 'stoic', 'The 3 Signs Something Will Bring You Joy | Kate Bowler', 47, 400, 1304, 'video'],
  ['cycle', 'bbc', 'Should we cycle more?', 6, 60, 1468, 'audio'],
  ['apps', 'bbc', 'Can apps teach you a language?', 6, 30, 1468, 'audio'],
  ['smells', 'bbc', 'How do we describe smells?', 6, 20, 1468, 'audio'],
  ['emails', 'bbc', 'Rude emails', 6, 10, 1468, 'audio'],
  // edge cases: unknown length, no publish date, other feeds
  ['daily1', 'daily', 'A day in the news', 25, 5, 1489, 'audio'],
  ['daily2', 'daily', 'Length not known yet', null, 2, 1489, 'audio'],
  ['up1', 'upfirst', 'Morning briefing', 14, 26, 1489, 'audio'],
  ['up2', 'upfirst', 'An episode with no date', 12, null, null, 'audio'],
  ['fresh1', 'fresh', 'An interview', 45, 500, 1324, 'audio'],
];

export type SeedBase = {
  pg: Db;
  now: number;
  ago(hours: number): Date;
  L: typeof L;
  FEEDS: typeof FEEDS;
  eps: Ep[];
  ep(key: string): Ep;
};

export async function seedBase(pg: Db, now = Date.now()): Promise<SeedBase> {
  const ago = (hours: number) => new Date(now - hours * 3_600_000);
  const people: [Who, string, Record<string, unknown>][] = [
    ['alex', 'Alex Owner', { country: 'MY', tz: 'Asia/Kuala_Lumpur', bio: 'Runs the place.', listened_ms: 7_200_000 }],
    ['bea', 'Bea Reads', { country: 'GB', tz: 'Europe/London', avatar_url: 'https://img.example.com/bea.png', avatar_path: 'avatars/bea.png', avatar_bytes: 2048, age_range: '25-34', gender: 'woman', industry: 'Design' }],
    ['cy', 'Cy at Dawn', { country: 'DE', listened_ms: 3_600_000, birthday: '1990-04-02' }],
    ['dee', 'Dee Private', { private_listening: true, likes_public: false, private_subscriptions: true, hide_often_listened: true }],
    ['eli', 'Eli Commuter', { country: 'US', tz: 'America/New_York', hide_badge: true, hide_stickers: true }],
    ['fay', 'Fay Notes', { country: 'SG', notifications_seen_at: ago(5) }],
    ['gus', 'Gus Walks', { country: 'CA', rules_accepted_at: null }],
    ['hal', 'Hal Suspended', { suspended_at: ago(30) }],
    ['ivy', 'Ivy Hidden', { hidden_at: ago(48) }],
    ['jo', 'Jo Leaving', { country: 'MY' }],
  ];
  for (const [n, [who, name, extra]] of people.entries()) {
    const cols: Record<string, unknown> = {
      id: L[who], email: `${who}@mig.example.test`, password_hash: 'x', display_name: name, created_at: ago(2000 - n * 10),
      rules_accepted_at: ago(1900 - n * 10), ...extra,
    };
    const names = Object.keys(cols);
    await pg.query(`INSERT INTO listeners (${names.join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')})`, names.map((k) => cols[k]));
  }
  const eps: Ep[] = [];
  for (const [key, feed, title, mins, hours, genre, kind] of EPS) {
    const feedUrl = FEEDS[feed];
    const guid = `guid-${key}`;
    const e: Ep = { key, id: episodeIdOf(feedUrl, guid), feed, feedUrl, guid, title, durationMs: mins === null ? null : mins * 60_000, publishedAt: hours === null ? null : ago(hours), genreId: genre, mediaKind: kind };
    await pg.query(
      `INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url, image_url, duration_ms, published_at, genre_id, media_kind, first_seen_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
      [e.id, feedUrl, guid, title, `Show ${feed}`, `https://cdn.example.com/${key}.mp3`, key === 'up2' ? null : `https://img.example.com/${key}.jpg`,
        e.durationMs, e.publishedAt, genre, kind, ago((hours ?? 600) - 1)]);
    eps.push(e);
  }
  const byKey = new Map(eps.map((e) => [e.key, e]));
  return { pg, now, ago, L, FEEDS, eps, ep: (k) => { const e = byKey.get(k); if (!e) throw new Error(`no seed episode ${k}`); return e; } };
}
