// Fills one demo account (and 6 helper accounts) with sample data so every phone screen has content.
/**
 * Owner, 2026-10-05: ONE demo account on the production database plus 6 helpers, with clearly
 * fake but realistic data — follows, chats, timestamped comments and replies, likes, reactions
 * (the heat curve), clips, subscriptions to feeds already in `episodes`, positions, listened
 * ranges, favourites, moments and search history. Notifications are the Following feed
 * (`activity` rows of the people you follow), so the helpers' comments, clips and listens fill it.
 *
 * NOT seeded: voice posts (each needs an audio blob in the approved store — skipped, we host no
 * audio for a demo), downloads and the queue (phone-only), the Inbox (built on the phone from
 * the synced subscriptions — it fills itself).
 *
 *   cd apps/api && npx tsx scripts/seed-demo.ts      (DATABASE_URL from apps/api/.env)
 *   cd apps/api && npx tsx scripts/unseed-demo.ts    (removes everything this made)
 *
 * Every account it makes is in DEMO_ACCOUNTS (emails demo+…@socialmorning.app). Re-running is
 * safe: the accounts are upserted by email, their seeded content is cleared, then written again.
 * The demo login goes to apps/api/.env.demo-account (gitignored by `.env.*`); it is never printed.
 * The same password is kept across re-runs while that file exists.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import postgres from 'postgres';
import { bucketOf } from '@socialmorning/social-core';
import { hashPassword } from '../src/auth/password.ts';
import { fromPostgres, type Db } from '../src/db/db.ts';
import { rebuildEpisodeHeat } from '../src/heat/rebuild.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(HERE, '..');
export const LOGIN_FILE = join(API_DIR, '.env.demo-account');

/** Every account the seed makes. The unseed removes exactly these emails. */
export const DEMO_ACCOUNTS = [
  { key: 'main', email: 'demo+main@socialmorning.app', name: 'Demo Listener', bio: 'The demo account. Everything here is sample data.', country: 'MY' },
  { key: 'h1', email: 'demo+1@socialmorning.app', name: 'Juniper Reads', bio: 'Morning walks, long episodes.', country: 'GB' },
  { key: 'h2', email: 'demo+2@socialmorning.app', name: 'Otto at Dawn', bio: 'Listens on the first train.', country: 'DE' },
  { key: 'h3', email: 'demo+3@socialmorning.app', name: 'Kettle and Tea', bio: 'Two cups, one episode.', country: 'MY' },
  { key: 'h4', email: 'demo+4@socialmorning.app', name: 'Sam the Commuter', bio: 'Forty-five minutes each way.', country: 'US' },
  { key: 'h5', email: 'demo+5@socialmorning.app', name: 'Lumen Notes', bio: 'Writes down the good bits.', country: 'SG' },
  { key: 'h6', email: 'demo+6@socialmorning.app', name: 'River Walks', bio: 'Podcasts by the water.', country: 'CA' },
] as const;
type Who = (typeof DEMO_ACCOUNTS)[number]['key'];

/** Feeds already in the episodes table (checked 2026-10-05). The first three carry the social content. */
const FEEDS = {
  pi: 'https://feeds.simplecast.com/BqbsxVfO', // 99% Invisible
  stoic: 'https://feeds.acast.com/public/shows/6abacdd76ffb28f8d6775e00', // The Daily Stoic
  bbc: 'https://podcasts.files.bbci.co.uk/p02pc9tn.rss', // 6 Minute English
  daily: 'https://feeds.simplecast.com/Sl5CSM3S', // The Daily
  upfirst: 'https://feeds.npr.org/510318/podcast.xml', // Up First
  fresh: 'https://feeds.npr.org/381444908/podcast.xml', // Fresh Air
} as const;

/** Episodes by exact title; a missing title falls back to that feed's next newest episode with a length. */
const EPISODES: Record<string, { feed: keyof typeof FEEDS; title: string }> = {
  rocky: { feed: 'pi', title: 'The Rocky Statue' },
  phone: { feed: 'pi', title: '100 Objects #19: Western Electric 500 Series' },
  bamboo: { feed: 'pi', title: 'Bamboo Is Innocent' },
  tootle: { feed: 'pi', title: 'Tootle of a Devilish Song' },
  rules: { feed: 'stoic', title: '50 Stoic Rules to Live By' },
  wisdom: { feed: 'stoic', title: 'Do You Know Where to Find It? | Why Does Ancient Wisdom Still Surprise' },
  joy: { feed: 'stoic', title: 'The 3 Signs Something Will Bring You Joy | Kate Bowler' },
  cycle: { feed: 'bbc', title: 'Should we cycle more?' },
  apps: { feed: 'bbc', title: 'Can apps teach you a language?' },
  smells: { feed: 'bbc', title: 'How do we describe smells?' },
  emails: { feed: 'bbc', title: 'Rude emails' },
};

const HOUR = 3_600_000;
type Ep = { id: string; feed_url: string; title: string; show_title: string | null; duration_ms: number };

/** A comment thread: who, where (fraction of the episode), when (hours ago), text, and replies. */
type Thread = { ep: string; who: Who; at: number; ago: number; body: string; likes?: Who[]; replies?: { who: Who; ago: number; body: string; likes?: Who[] }[] };

const THREADS: Thread[] = [
  { ep: 'rocky', who: 'h1', at: 0.12, ago: 70, body: 'I never knew a film prop could start an argument this long. Great opening.', likes: ['main', 'h2', 'h5'],
    replies: [{ who: 'main', ago: 66, body: 'Same here. I had to pause and look up the steps afterwards.' }, { who: 'h3', ago: 60, body: 'The part about the city council meeting is my favourite.' }] },
  { ep: 'rocky', who: 'main', at: 0.41, ago: 64, body: 'This is the moment it clicked for me: art is whatever people decide to climb towards.', likes: ['h1', 'h2', 'h4', 'h5'],
    replies: [{ who: 'h5', ago: 50, body: 'Writing that line down.' }] },
  { ep: 'rocky', who: 'h4', at: 0.78, ago: 30, body: 'Listened to this on the bus and laughed out loud. Sorry, fellow passengers.', likes: ['h6'] },
  { ep: 'phone', who: 'h2', at: 0.08, ago: 52, body: 'My grandparents had one of these phones. You could drop it down the stairs and it still worked.', likes: ['main', 'h1'],
    replies: [{ who: 'h6', ago: 47, body: 'They really built things to last back then.' }] },
  { ep: 'phone', who: 'h5', at: 0.55, ago: 40, body: 'The bit about the dial being designed for gloved fingers is such a lovely detail.', likes: ['main', 'h3'] },
  { ep: 'phone', who: 'main', at: 0.83, ago: 26, body: 'Good ending. I want a whole series about ordinary objects like this.', likes: ['h2'] },
  { ep: 'bamboo', who: 'h3', at: 0.22, ago: 90, body: 'Didn\'t expect to feel sorry for a plant today.', likes: ['h1', 'h6'] },
  { ep: 'bamboo', who: 'h6', at: 0.61, ago: 85, body: 'This changed how I look at the garden next door.' },
  { ep: 'tootle', who: 'h1', at: 0.33, ago: 20, body: 'The sound design in this section is beautiful. Headphones recommended.', likes: ['main', 'h4'] },
  { ep: 'rules', who: 'h4', at: 0.05, ago: 44, body: 'Rule number one already hit hard on a Monday morning.', likes: ['main', 'h2', 'h3'],
    replies: [{ who: 'main', ago: 42, body: 'Ha, same. I listened to it twice before work.' }, { who: 'h2', ago: 36, body: 'Monday listeners unite.' }] },
  { ep: 'rules', who: 'h5', at: 0.47, ago: 34, body: 'Saving this list for the next time I feel rushed.', likes: ['h1'] },
  { ep: 'rules', who: 'main', at: 0.72, ago: 22, body: 'The one about controlling only your own effort is the one I needed.', likes: ['h3', 'h4', 'h5'],
    replies: [{ who: 'h3', ago: 18, body: 'That one gets me every time too.' }] },
  { ep: 'wisdom', who: 'h2', at: 0.3, ago: 14, body: 'Short and calm. Perfect for the walk to the station.', likes: ['h4'] },
  { ep: 'joy', who: 'h6', at: 0.5, ago: 100, body: 'A gentle conversation. I liked the idea of noticing small joys on purpose.', likes: ['main'] },
  { ep: 'cycle', who: 'h3', at: 0.2, ago: 28, body: 'Learned the word "commute" has a whole family of phrases. Very useful.', likes: ['main', 'h1'],
    replies: [{ who: 'h4', ago: 25, body: 'I cycle to work, so this one was made for me.' }] },
  { ep: 'cycle', who: 'main', at: 0.64, ago: 10, body: 'Using this episode to practise my listening before an interview. The vocabulary list at the end helps.', likes: ['h3', 'h5'] },
  { ep: 'apps', who: 'h5', at: 0.4, ago: 8, body: 'As someone learning two languages with apps, this felt very personal.', likes: ['main', 'h2'],
    replies: [{ who: 'h1', ago: 6, body: 'Which apps do you use? Always looking for a good one.' }] },
  { ep: 'smells', who: 'h1', at: 0.25, ago: 4, body: 'Describing smells is so hard. Now I want to try with my morning coffee.', likes: ['h3'] },
  { ep: 'emails', who: 'h4', at: 0.5, ago: 3, body: 'Every office worker should hear this one.', likes: ['main', 'h2', 'h6'] },
];

/** Hearts on the heat curve: who taps where. */
const REACTIONS: { ep: string; who: Who; at: number[] }[] = [
  { ep: 'rocky', who: 'main', at: [0.41, 0.6] }, { ep: 'rocky', who: 'h1', at: [0.12, 0.41, 0.42] }, { ep: 'rocky', who: 'h2', at: [0.4, 0.78] },
  { ep: 'rocky', who: 'h4', at: [0.41, 0.79] }, { ep: 'rocky', who: 'h5', at: [0.405] },
  { ep: 'phone', who: 'h1', at: [0.08, 0.55] }, { ep: 'phone', who: 'h3', at: [0.55, 0.56] }, { ep: 'phone', who: 'main', at: [0.55] },
  { ep: 'rules', who: 'h1', at: [0.05, 0.72] }, { ep: 'rules', who: 'h2', at: [0.72] }, { ep: 'rules', who: 'h3', at: [0.05, 0.47, 0.72] },
  { ep: 'rules', who: 'h6', at: [0.72] }, { ep: 'rules', who: 'main', at: [0.05] },
  { ep: 'cycle', who: 'h1', at: [0.2] }, { ep: 'cycle', who: 'h5', at: [0.64, 0.2] }, { ep: 'apps', who: 'main', at: [0.4] }, { ep: 'apps', who: 'h3', at: [0.4, 0.8] },
];

const CLIPS: { who: Who; ep: string; at: number; secs: number; ago: number; caption: string }[] = [
  { who: 'main', ep: 'rocky', at: 0.4, secs: 45, ago: 63, caption: 'The best minute of the episode.' },
  { who: 'main', ep: 'rules', at: 0.71, secs: 30, ago: 21, caption: 'For the next busy morning.' },
  { who: 'main', ep: 'cycle', at: 0.62, secs: 40, ago: 9, caption: 'Vocabulary practice.' },
  { who: 'h1', ep: 'tootle', at: 0.32, secs: 35, ago: 19, caption: 'Listen with headphones.' },
  { who: 'h2', ep: 'phone', at: 0.07, secs: 50, ago: 51, caption: 'Built to last.' },
  { who: 'h3', ep: 'rules', at: 0.46, secs: 25, ago: 33, caption: 'Keep this one close.' },
  { who: 'h5', ep: 'apps', at: 0.39, secs: 30, ago: 7, caption: 'Language learners, this is for you.' },
];

const FOLLOWS: [Who, Who][] = [
  ['main', 'h1'], ['main', 'h2'], ['main', 'h3'], ['main', 'h4'], ['main', 'h5'], ['main', 'h6'],
  ['h1', 'main'], ['h2', 'main'], ['h3', 'main'], ['h4', 'main'], ['h5', 'main'], // h6 does not follow back
  ['h1', 'h2'], ['h2', 'h1'], ['h3', 'h1'], ['h4', 'h5'], ['h5', 'h3'], ['h6', 'h1'],
];

/** Chats: [from, to, minutes ago, body, episode key?, read?]. The demo account is `main`. */
const CHATS: { from: Who; to: Who; ago: number; body: string; ep?: string; read: boolean }[] = [
  { from: 'h1', to: 'main', ago: 60 * 30, body: 'Hi! Saw your comment on the Rocky statue episode. Have you heard the one about bamboo?', read: true },
  { from: 'main', to: 'h1', ago: 60 * 29, body: 'Not yet. Is it good?', read: true },
  { from: 'h1', to: 'main', ago: 60 * 28, body: 'Really good. Here it is.', ep: 'bamboo', read: true },
  { from: 'main', to: 'h1', ago: 60 * 5, body: 'Listened this morning. You were right, loved it.', read: true },
  { from: 'h1', to: 'main', ago: 50, body: 'Told you! Next one for you:', ep: 'tootle', read: false },
  { from: 'h1', to: 'main', ago: 48, body: 'The middle part is the best.', read: false },
  { from: 'h2', to: 'main', ago: 60 * 40, body: 'Morning! Which episode are you on today?', read: true },
  { from: 'main', to: 'h2', ago: 60 * 39, body: 'The Stoic rules one. Short and useful.', ep: 'rules', read: true },
  { from: 'h2', to: 'main', ago: 60 * 38, body: 'Adding it to my queue for the train.', read: true },
  { from: 'main', to: 'h2', ago: 60 * 12, body: 'How was it?', read: true },
  { from: 'h3', to: 'main', ago: 60 * 3, body: 'Are you still practising for the interview?', read: true },
  { from: 'main', to: 'h3', ago: 60 * 2.5, body: 'Yes, every day. The English podcasts help a lot.', read: true },
  { from: 'h3', to: 'main', ago: 20, body: 'This one has good vocabulary for it. Good luck!', ep: 'emails', read: false },
  { from: 'main', to: 'h4', ago: 60 * 7, body: 'Your comment about laughing on the bus made my day.', read: true },
  { from: 'h4', to: 'main', ago: 60 * 6, body: 'Ha, thank you. It was a very quiet bus.', read: true },
];

/** The demo account's playback positions: [episode, fraction, finished, hours ago]. */
const POSITIONS: [string, number, boolean, number][] = [
  ['rocky', 1, true, 64], ['phone', 0.9, false, 26], ['bamboo', 1, true, 6], ['tootle', 0.35, false, 2],
  ['rules', 1, true, 22], ['wisdom', 0.5, false, 13], ['cycle', 0.7, false, 10], ['apps', 0.42, false, 1],
];

/** Listening (friends listening, the "listened" feed items): [who, episode, fraction listened, hours ago]. */
const LISTENS: [Who, string, number, number][] = [
  ['main', 'rocky', 1, 64], ['main', 'bamboo', 1, 6], ['main', 'rules', 1, 22], ['main', 'cycle', 0.7, 10],
  ['h1', 'rocky', 1, 70], ['h1', 'smells', 0.8, 4], ['h1', 'tootle', 0.6, 20],
  ['h2', 'phone', 1, 52], ['h2', 'wisdom', 1, 14], ['h3', 'cycle', 0.9, 28], ['h3', 'rules', 0.8, 34],
  ['h4', 'emails', 1, 3], ['h4', 'rules', 1, 44], ['h5', 'apps', 0.7, 8], ['h5', 'phone', 0.9, 40], ['h6', 'joy', 1, 100],
];

const SUBS: Record<Who, (keyof typeof FEEDS)[]> = {
  main: ['pi', 'stoic', 'bbc', 'daily', 'upfirst', 'fresh'],
  h1: ['pi', 'bbc'], h2: ['pi', 'stoic'], h3: ['bbc', 'stoic', 'daily'], h4: ['stoic', 'bbc'], h5: ['bbc', 'pi'], h6: ['stoic'],
};
const STARRED: (keyof typeof FEEDS)[] = ['pi', 'stoic'];

const MOMENTS: [string, number, string, number][] = [
  ['rocky', 0.41, 'The idea about what people climb towards.', 63],
  ['rules', 0.72, 'Control only your own effort.', 22],
  ['cycle', 0.55, 'Phrases about getting around: look these up.', 10],
  ['phone', 0.3, 'Story to tell at dinner.', 25],
];
const FAV_EPISODES = ['rocky', 'rules', 'bamboo', 'cycle'];
const SEARCHES = ['design', 'stoic', 'learn english', 'history of objects'];

// ---------------------------------------------------------------------------------------------

export function loadEnv(): void {
  if (!process.env['DATABASE_URL'] && existsSync(join(API_DIR, '.env'))) process.loadEnvFile(join(API_DIR, '.env'));
  if (!process.env['DATABASE_URL']) throw new Error('DATABASE_URL is not set (apps/api/.env)');
}

/**
 * Removes the content the seed writes for these accounts (not the accounts). Returns the
 * episodes whose heat curve must be rebuilt. Used by both scripts.
 */
export async function clearContent(db: Db, ids: string[]): Promise<string[]> {
  const touched = await db.query<{ episode_id: string }>(
    `SELECT episode_id FROM comments WHERE author_id = ANY($1::uuid[]) AND offset_ms IS NOT NULL
     UNION SELECT episode_id FROM reactions WHERE listener_id = ANY($1::uuid[])`, [ids]);
  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM activity WHERE actor_id = ANY($1::uuid[])', [ids]);
    await tx.query('DELETE FROM comment_likes WHERE listener_id = ANY($1::uuid[])', [ids]);
    await tx.query('DELETE FROM comments WHERE author_id = ANY($1::uuid[]) AND parent_id IS NOT NULL', [ids]);
    // A demo comment someone else replied to stays as a placeholder (FR-010), as a real delete would.
    await tx.query(
      `UPDATE comments c SET body = NULL, author_id = NULL, offset_ms = NULL, deleted_at = now()
       WHERE c.author_id = ANY($1::uuid[]) AND EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = c.id)`, [ids]);
    await tx.query('DELETE FROM comments WHERE author_id = ANY($1::uuid[])', [ids]);
    await tx.query('DELETE FROM reactions WHERE listener_id = ANY($1::uuid[])', [ids]);
    await tx.query('DELETE FROM clips WHERE author_id = ANY($1::uuid[])', [ids]);
    await tx.query('DELETE FROM follows WHERE follower_id = ANY($1::uuid[]) AND followed_id = ANY($1::uuid[])', [ids]);
    await tx.query('DELETE FROM chat_messages WHERE sender_id = ANY($1::uuid[]) AND recipient_id = ANY($1::uuid[])', [ids]);
    for (const t of ['subscriptions', 'subscription_events', 'positions', 'listened_ranges', 'library_items']) {
      await tx.query(`DELETE FROM ${t} WHERE listener_id = ANY($1::uuid[])`, [ids]);
    }
  });
  return touched.map((r) => r.episode_id);
}

async function readPassword(): Promise<string> {
  if (existsSync(LOGIN_FILE)) {
    const m = /^DEMO_PASSWORD=(.+)$/m.exec(readFileSync(LOGIN_FILE, 'utf8'));
    if (m?.[1]) return m[1].trim();
  }
  return `demo-${randomBytes(9).toString('base64url')}`;
}

async function main(): Promise<void> {
  loadEnv();
  const sql = postgres(process.env['DATABASE_URL']!, { ssl: 'require', max: 1, onnotice: () => {} });
  const db = fromPostgres(sql);
  try {
    // 1. Episodes, from rows that already exist.
    const ep: Record<string, Ep> = {};
    const used = new Set<string>();
    for (const [key, want] of Object.entries(EPISODES)) {
      const feed = FEEDS[want.feed];
      let [row] = await db.query<Ep>('SELECT id, feed_url, title, show_title, duration_ms FROM episodes WHERE feed_url = $1 AND title = $2 AND duration_ms IS NOT NULL LIMIT 1', [feed, want.title]);
      if (!row || used.has(row.id)) {
        [row] = await db.query<Ep>(
          `SELECT id, feed_url, title, show_title, duration_ms FROM episodes WHERE feed_url = $1 AND duration_ms IS NOT NULL AND NOT (id = ANY($2::text[]))
           ORDER BY published_at DESC NULLS LAST, id LIMIT 1`, [feed, [...used]]);
      }
      if (!row) throw new Error(`no episode with a length in ${want.feed}`);
      used.add(row.id);
      ep[key] = { ...row, duration_ms: Number(row.duration_ms) };
    }

    // 2. Accounts (upsert by email). Helpers get a random password nobody keeps.
    const password = await readPassword();
    const id = {} as Record<Who, string>;
    for (const a of DEMO_ACCOUNTS) {
      const hash = await hashPassword(a.key === 'main' ? password : randomBytes(24).toString('base64url'));
      const [r] = await db.query<{ id: string }>(
        `INSERT INTO listeners (email, password_hash, display_name, bio, country) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, display_name = EXCLUDED.display_name,
           bio = EXCLUDED.bio, country = EXCLUDED.country, failed_attempts = 0, locked_until = NULL, suspended_at = NULL
         RETURNING id`, [a.email, hash, a.name, a.bio, a.country]);
      id[a.key] = r!.id;
    }
    writeFileSync(LOGIN_FILE, `# Demo account on production (seed: apps/api/scripts/seed-demo.ts). Gitignored.\nDEMO_EMAIL=${DEMO_ACCOUNTS[0].email}\nDEMO_PASSWORD=${password}\n`, { mode: 0o600 });
    const ids = Object.values(id);

    // 3. Clear what an earlier run wrote, so nothing doubles.
    const touched = new Set(await clearContent(db, ids));

    const now = Date.now();
    const ago = (hours: number) => new Date(now - hours * HOUR);
    const at = (key: string, f: number) => Math.min(ep[key]!.duration_ms - 1, Math.max(0, Math.round(ep[key]!.duration_ms * f)));
    const counts: Record<string, number> = {};
    const bump = (t: string, n = 1) => { counts[t] = (counts[t] ?? 0) + n; };

    await db.transaction(async (tx) => {
      // Follows.
      for (const [a, b] of FOLLOWS) {
        await tx.query('INSERT INTO follows (follower_id, followed_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id[a], id[b], ago(200)]);
        bump('follows');
      }
      // Subscriptions (+ the Studio's subscription history).
      for (const [who, feeds] of Object.entries(SUBS) as [Who, (keyof typeof FEEDS)[]][]) {
        for (const f of feeds) {
          const star = who === 'main' && STARRED.includes(f);
          await tx.query('INSERT INTO subscriptions (listener_id, feed_url, starred, created_at, starred_at) VALUES ($1, $2, $3, $4, $5)',
            [id[who], FEEDS[f], star, ago(240), star ? ago(230) : null]);
          await tx.query(`INSERT INTO subscription_events (listener_id, feed_url, kind, at) VALUES ($1, $2, 'sub', $3)`, [id[who], FEEDS[f], ago(240)]);
          bump('subscriptions'); bump('subscription_events');
        }
      }
      // Comments, replies, likes, and the "commented" feed items.
      const commentIds: { id: string; ep: string; who: Who; body: string; offsetMs: number }[] = [];
      for (const t of THREADS) {
        const off = at(t.ep, t.at);
        const [c] = await tx.query<{ id: string }>(
          'INSERT INTO comments (episode_id, author_id, body, offset_ms, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [ep[t.ep]!.id, id[t.who], t.body, off, ago(t.ago)]);
        bump('comments');
        commentIds.push({ id: c!.id, ep: t.ep, who: t.who, body: t.body, offsetMs: off });
        touched.add(ep[t.ep]!.id);
        await tx.query(`INSERT INTO activity (actor_id, kind, episode_id, moment_ms, ref_id, hidden, created_at) VALUES ($1, 'commented', $2, $3, $4, false, $5)`,
          [id[t.who], ep[t.ep]!.id, off, c!.id, ago(t.ago)]);
        bump('activity');
        for (const l of t.likes ?? []) {
          if (l === t.who) continue;
          await tx.query('INSERT INTO comment_likes (comment_id, listener_id, created_at) VALUES ($1, $2, $3)', [c!.id, id[l], ago(t.ago - 1)]);
          bump('comment_likes');
        }
        for (const r of t.replies ?? []) {
          const [rc] = await tx.query<{ id: string }>(
            'INSERT INTO comments (episode_id, author_id, parent_id, body, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [ep[t.ep]!.id, id[r.who], c!.id, r.body, ago(r.ago)]);
          bump('comments');
          for (const l of r.likes ?? []) {
            if (l === r.who) continue;
            await tx.query('INSERT INTO comment_likes (comment_id, listener_id, created_at) VALUES ($1, $2, $3)', [rc!.id, id[l], ago(r.ago - 1)]);
            bump('comment_likes');
          }
        }
      }
      // Reactions (one per listener per bucket, as the primary key says).
      for (const r of REACTIONS) {
        const e = ep[r.ep]!;
        for (const f of r.at) {
          const off = at(r.ep, f);
          const res = await tx.query('INSERT INTO reactions (listener_id, episode_id, bucket, offset_ms) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING 1',
            [id[r.who], e.id, bucketOf(off, e.duration_ms), off]);
          bump('reactions', res.length);
          touched.add(e.id);
        }
      }
      // Clips and their feed items.
      for (const [n, c] of CLIPS.entries()) {
        const start = at(c.ep, c.at);
        const end = Math.min(ep[c.ep]!.duration_ms, start + c.secs * 1000);
        const [row] = await tx.query<{ id: string }>(
          'INSERT INTO clips (author_id, client_id, episode_id, start_ms, end_ms, caption, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
          [id[c.who], `demo-seed-${n + 1}`, ep[c.ep]!.id, start, end, c.caption, ago(c.ago)]);
        await tx.query(`INSERT INTO activity (actor_id, kind, episode_id, moment_ms, ref_id, hidden, created_at) VALUES ($1, 'clipped', $2, $3, $4, false, $5)`,
          [id[c.who], ep[c.ep]!.id, start, row!.id, ago(c.ago)]);
        bump('clips'); bump('activity');
      }
      // Chats (both sides follow each other).
      for (const m of CHATS) {
        const when = new Date(now - m.ago * 60_000);
        await tx.query('INSERT INTO chat_messages (sender_id, recipient_id, body, episode_id, created_at, read_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [id[m.from], id[m.to], m.body, m.ep ? ep[m.ep]!.id : null, when, m.read ? new Date(when.getTime() + 60_000) : null]);
        bump('chat_messages');
      }
      // Positions (Continue listening / history on the phone after sign-in).
      for (const [n, [key, f, finished, h]] of POSITIONS.entries()) {
        await tx.query(
          `INSERT INTO positions (listener_id, episode_id, offset_ms, finished, progress_seq, explicit_seek, device_id, received_at)
           VALUES ($1, $2, $3, $4, $5, false, 'demo-seed', $6)`,
          [id.main, ep[key]!.id, finished ? ep[key]!.duration_ms - 1000 : at(key, f), finished, 1000 + n, ago(h)]);
        bump('positions');
      }
      // Listened ranges (Friends listening: last 7 days) and the "listened" feed items.
      for (const [who, key, f, h] of LISTENS) {
        const when = ago(h);
        const day = when.toISOString().slice(0, 10);
        await tx.query(
          `INSERT INTO listened_ranges (listener_id, episode_id, day, device_id, ranges, updated_at) VALUES ($1, $2, $3, 'demo-seed', ($4::text)::jsonb, $5)`,
          [id[who], ep[key]!.id, day, JSON.stringify([[0, at(key, f)]]), when]);
        await tx.query(`INSERT INTO activity (actor_id, kind, episode_id, day, hidden, created_at) VALUES ($1, 'listened', $2, $3, false, $4) ON CONFLICT DO NOTHING`,
          [id[who], ep[key]!.id, day, when]);
        bump('listened_ranges'); bump('activity');
      }
      // Library: favourites, favourite comments, moments, searches (the demo account only).
      const lib = async (kind: string, key: string, payload: Record<string, unknown>, when: Date) => {
        await tx.query('INSERT INTO library_items (listener_id, kind, item_key, payload, updated_at) VALUES ($1, $2, $3, ($4::text)::jsonb, $5)',
          [id.main, kind, key, JSON.stringify(payload), when]);
        bump('library_items');
      };
      for (const [n, key] of FAV_EPISODES.entries()) await lib('fav_episode', ep[key]!.id, {}, ago(5 + n * 7));
      const favs = commentIds.filter((c) => c.who !== 'main').slice(0, 3);
      for (const [n, c] of favs.entries()) {
        const author = DEMO_ACCOUNTS.find((a) => a.key === c.who)!.name;
        await lib('fav_comment', c.id, { episodeId: ep[c.ep]!.id, body: c.body, author, offsetMs: c.offsetMs }, ago(4 + n * 5));
      }
      for (const [key, f, note, h] of MOMENTS) {
        const savedAt = ago(h).getTime();
        const atMs = at(key, f);
        await lib('moment', `${ep[key]!.id}@${atMs}@${savedAt}`, { episodeId: ep[key]!.id, atMs, note, savedAt }, ago(h));
      }
      for (const [n, term] of SEARCHES.entries()) await lib('search', term.toLowerCase(), { term }, ago(1 + n * 9));
    });

    // 4. Heat curves for every episode the demo touched (before or now).
    for (const e of touched) await rebuildEpisodeHeat(db, e);
    counts['episode_heat rebuilt (episodes)'] = touched.size;
    counts['listeners (upserted)'] = DEMO_ACCOUNTS.length;

    console.log('Demo seed done. Login written to apps/api/.env.demo-account (not printed).');
    for (const [t, n] of Object.entries(counts)) console.log(`  ${t}: ${n}`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
