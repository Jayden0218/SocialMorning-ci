// Fills one demo account (and 6 helper accounts) with sample data so every phone screen has content — on DynamoDB.
/**
 * Owner, 2026-10-05: ONE demo account on the production database plus 6 helpers, with clearly
 * fake but realistic data — follows, chats, timestamped comments and replies, likes, reactions
 * (the heat curve), clips, subscriptions to feeds already in the catalogue, positions, listened
 * ranges, favourites, moments and search history. Notifications are the Following feed
 * (`activity` of the people you follow), so the helpers' comments, clips and listens fill it.
 *
 * Every write goes through the repo functions the API uses. Times: the Store's clock is set to "N hours ago"
 * before each write. Re-running is safe: the demo accounts of an earlier run are deleted first
 * (the account-deletion path), then everything is written again.
 *
 * NOT seeded: voice posts (each needs an audio blob in the approved store — skipped, we host no
 * audio for a demo), downloads and the queue (phone-only), the Inbox (built on the phone from
 * the synced subscriptions — it fills itself), the account's country.
 *
 *   cd apps/api && npx tsx scripts/seed-demo.ts --prefix <set>   (DynamoDB Local via DDB_ENDPOINT; `dev` = the dev loop's tables;
 *                                                                 or --prod --aws: runbook docs/runbooks/m26-cutover.md)
 *   cd apps/api && npx tsx scripts/unseed-demo.ts [the same flags]  (removes everything this made)
 * A leftover `--ddb` flag (scripts/dev-ddb.sh used to pass it) is accepted and ignored.
 *
 * Every account it makes is in DEMO_ACCOUNTS (emails demo+…@socialmorning.app). The demo login goes to
 * apps/api/.env.demo-account (gitignored by `.env.*`); it is never printed. The same password is kept across
 * re-runs while that file exists.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { bucketOf } from '@socialmorning/social-core';
import { hashPassword } from '../src/auth/password.ts';
import { withStore } from '../src/db/backend-ddb.ts';
import type { Db } from '../src/db/db.ts';
import { createStore, PROD_TABLES, prefixedTables, type Store } from '../src/db/ddb/store.ts';
import { createDdbClients } from '../src/db/ddb/client.ts';
import { withThrottleRetry } from './retry-throttle.ts';
import { tablesFor } from '../src/config.ts';
import { createListener, listenerByEmail } from '../src/db/repos/account/listeners.ts';
import { updateProfile } from '../src/db/repos/account/profile.ts';
import { finishDeletion } from '../src/db/repos/account/deletion.ts';
import { newestOfShows } from '../src/db/repos/discover/foryou.ts';
import { getEpisode, type EpisodeRow } from '../src/db/repos/library/episodes.ts';
import { registerCard } from '../src/catalog/feed.ts';
import { merge as mergeSubscriptions } from '../src/db/repos/library/subscriptions.ts';
import { merge as mergeLibrary, type LibraryIn } from '../src/db/repos/library/library.ts';
import { observePosition } from '../src/db/repos/library/positions.ts';
import { replaceRanges } from '../src/db/repos/library/listened.ts';
import { follow } from '../src/db/repos/social/follows.ts';
import { postCommentInTx, toggleReactionInTx, likeCommentInTx } from '../src/db/repos/social/comment-writes.ts';
import { createClip } from '../src/db/repos/social/clips.ts';
import { send as sendChat, thread as readThread } from '../src/db/repos/social/chat.ts';

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
type Ep = EpisodeRow & { duration_ms: number };

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

/** Loads apps/api/.env when present (DynamoDB Local needs none of it; kept for SESSION_PEPPER / CURSOR_SECRET). */
export function loadEnv(): void {
  if (existsSync(join(API_DIR, '.env'))) process.loadEnvFile(join(API_DIR, '.env'));
}

/** `--a b --c` → { a: 'b', c: true }. */
export function parseArgs(argv: readonly string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { out[a.slice(2)] = next; i++; } else out[a.slice(2)] = true;
  }
  return out;
}

const SHOW_TITLES: Record<keyof typeof FEEDS, string> = { pi: '99% Invisible', stoic: 'The Daily Stoic', bbc: '6 Minute English', daily: 'The Daily', upfirst: 'Up First', fresh: 'Fresh Air' };

/**
 * M27: when the episodes the demo needs are not in the catalogue yet (an empty DynamoDB Local or staging set — nothing has refreshed
 * the feeds), register them under the same titles and feed URLs with made-up lengths and an enclosure that does not exist
 * (the demo only needs rows with ids and lengths — nothing plays). Does nothing when the first episode is already there.
 */
export async function ensureDemoCatalogue(db: Db, now: number): Promise<number> {
  const first = Object.values(EPISODES)[0]!;
  if ((await newestOfShows(db, [FEEDS[first.feed]], 5)).length > 0) return 0;
  let n = 0;
  for (const [key, want] of Object.entries(EPISODES)) {
    await registerCard(db, {
      feedUrl: FEEDS[want.feed], guid: `demo-${key}`, title: want.title, showTitle: SHOW_TITLES[want.feed],
      enclosureUrl: `https://example.invalid/demo/${key}.mp3`, durationMs: (20 + (n % 7) * 5) * 60_000,
      publishedAt: new Date(now - (n + 1) * 24 * HOUR).toISOString(),
    });
    n++;
  }
  return n;
}

/** Deletes the demo accounts of an earlier run with the account-deletion path of the backend in use. Returns how many. */
export async function removeDemo(db: Db): Promise<number> {
  let n = 0;
  for (const a of DEMO_ACCOUNTS) {
    const l = await listenerByEmail(db, a.email);
    if (!l) continue;
    await finishDeletion(db, {}, l.id);
    n++;
  }
  return n;
}

export async function readPassword(): Promise<string> {
  // M27: the owner can choose the demo password (DEMO_PASSWORD in the environment) so the staging deploy's smoke secret and this seed agree without a secret ever passing through chat.
  if (process.env['DEMO_PASSWORD']) return process.env['DEMO_PASSWORD'];
  if (existsSync(LOGIN_FILE)) {
    const m = /^DEMO_PASSWORD=(.+)$/m.exec(readFileSync(LOGIN_FILE, 'utf8'));
    if (m?.[1]) return m[1].trim();
  }
  return `demo-${randomBytes(9).toString('base64url')}`;
}

export type SeedDemoOpts = {
  password: string;
  now?: number;
  /** DynamoDB: moves the Store's clock to this time before a write (the repos stamp items with it). */
  setClock?: (ms: number) => void;
};

/** Writes the demo; returns the account ids and per-kind counts. */
export async function seedDemo(db: Db, o: SeedDemoOpts): Promise<{ id: Record<Who, string>; counts: Record<string, number> }> {
  const now = o.now ?? Date.now();
  const ago = (hours: number) => new Date(now - hours * HOUR);
  const at = (h: number) => o.setClock?.(now - h * HOUR);

  // 1. Episodes, from what the catalogue already has. A fresh DynamoDB set (the dev loop, staging) has none: register the sample ones.
  await ensureDemoCatalogue(db, now);
  const ep: Record<string, Ep> = {};
  const used = new Set<string>();
  const byFeed = new Map<string, { id: string; title: string; duration_ms: number | null }[]>();
  for (const [key, want] of Object.entries(EPISODES)) {
    const feed = FEEDS[want.feed];
    if (!byFeed.has(feed)) byFeed.set(feed, await newestOfShows(db, [feed], 500));
    const rows = byFeed.get(feed)!.filter((r) => r.duration_ms !== null && !used.has(r.id));
    const row = rows.find((r) => r.title === want.title) ?? rows[0];
    if (!row) throw new Error(`no episode with a length in ${want.feed}`);
    const full = await getEpisode(db, row.id);
    if (!full || full.duration_ms === null) throw new Error(`episode ${row.id} has no length`);
    used.add(row.id);
    ep[key] = { ...full, duration_ms: Number(full.duration_ms) };
  }

  // 2. Accounts: an earlier run's are deleted first, then made again.
  await removeDemo(db);
  const id = {} as Record<Who, string>;
  at(400);
  for (const a of DEMO_ACCOUNTS) {
    const hash = await hashPassword(a.key === 'main' ? o.password : randomBytes(24).toString('base64url'));
    const made = await createListener(db, a.email, hash, a.name);
    if (made === 'exists') throw new Error('a demo account is still there after the clean-up');
    await updateProfile(db, made.id, { bio: a.bio });
    id[a.key] = made.id;
  }

  const atMs = (key: string, f: number) => Math.min(ep[key]!.duration_ms - 1, Math.max(0, Math.round(ep[key]!.duration_ms * f)));
  const counts: Record<string, number> = {};
  const bump = (t: string, n = 1) => { counts[t] = (counts[t] ?? 0) + n; };

  // Follows.
  // Each row its own minute: lists sorted by time have no ties.
  for (const [n, [a, b]] of FOLLOWS.entries()) {
    at(200 - n / 60);
    await follow(db, id[a], id[b]);
    bump('follows');
  }
  // Subscriptions (the sync path writes the Studio's subscription history too).
  for (const [who, feeds] of Object.entries(SUBS) as [Who, (keyof typeof FEEDS)[]][]) {
    at(240);
    await mergeSubscriptions(db, id[who], feeds.map((f, n) => {
      const star = who === 'main' && STARRED.includes(f);
      return { feedUrl: FEEDS[f], createdAt: ago(240 - n / 60).toISOString(), starred: star, ...(star ? { starredAt: ago(230 - n / 60).toISOString() } : {}) };
    }));
    bump('subscriptions', feeds.length);
  }
  // Comments, replies, likes (the "commented" feed item comes with each top-level comment).
  const commentIds: { id: string; ep: string; who: Who; body: string; offsetMs: number }[] = [];
  const backdateComment = async (_cid: string, _when: Date) => {
  };
  for (const t of THREADS) {
    const e = ep[t.ep]!;
    const off = atMs(t.ep, t.at);
    at(t.ago);
    const c = await postCommentInTx(db, e, e.id, id[t.who], { body: t.body, offsetMs: off }, undefined);
    await backdateComment(c.id, ago(t.ago));
    bump('comments');
    commentIds.push({ id: c.id, ep: t.ep, who: t.who, body: t.body, offsetMs: off });
    for (const l of t.likes ?? []) {
      if (l === t.who) continue;
      at(t.ago - 1);
      await likeCommentInTx(db, c.id, id[l]);
      bump('comment_likes');
    }
    for (const r of t.replies ?? []) {
      at(r.ago);
      const rc = await postCommentInTx(db, e, e.id, id[r.who], { body: r.body, parentId: c.id }, undefined);
      await backdateComment(rc.id, ago(r.ago));
      bump('comments');
      for (const l of r.likes ?? []) {
        if (l === r.who) continue;
        at(r.ago - 1);
        await likeCommentInTx(db, rc.id, id[l]);
        bump('comment_likes');
      }
    }
  }
  // Reactions (a second tap in the same segment would take the first one back: one per listener per bucket).
  const tapped = new Set<string>();
  for (const r of REACTIONS) {
    const e = ep[r.ep]!;
    for (const f of r.at) {
      const off = atMs(r.ep, f);
      const k = `${r.who}|${e.id}|${bucketOf(off, e.duration_ms)}`;
      if (tapped.has(k)) continue;
      tapped.add(k);
      at(12);
      await toggleReactionInTx(db, e, e.id, id[r.who], { offsetMs: off });
      bump('reactions');
    }
  }
  // Clips and their feed items.
  for (const [n, c] of CLIPS.entries()) {
    const start = atMs(c.ep, c.at);
    const end = Math.min(ep[c.ep]!.duration_ms, start + c.secs * 1000);
    at(c.ago);
    await createClip(db, { authorId: id[c.who], clientId: `demo-seed-${n + 1}`, episodeId: ep[c.ep]!.id, startMs: start, endMs: end, caption: c.caption });
    bump('clips');
  }
  // Chats: a read message is read by its recipient right after (reading the thread marks it).
  for (const m of CHATS) {
    const when = now - m.ago * 60_000;
    o.setClock?.(when);
    await sendChat(db, id[m.from], id[m.to], m.body, m.ep ? ep[m.ep]!.id : undefined);
    if (m.read) {
      o.setClock?.(when + 60_000);
      await readThread(db, id[m.to], id[m.from]);
    }
    bump('chat_messages');
  }
  // Positions (Continue listening / history on the phone after sign-in).
  for (const [n, [key, f, finished, h]] of POSITIONS.entries()) {
    at(h);
    await observePosition(db, id.main, 'demo-seed', {
      episodeId: ep[key]!.id, offsetMs: finished ? ep[key]!.duration_ms - 1000 : atMs(key, f), finished, progressSeq: 1000 + n, explicitSeek: false,
    }, ago(h));
    bump('positions');
  }
  // Listened ranges (Friends listening: last 7 days) — the sync path writes the "listened" feed items.
  for (const [who, key, f, h] of LISTENS) {
    const when = ago(h);
    const day = when.toISOString().slice(0, 10);
    at(h);
    await replaceRanges(db, id[who], 'demo-seed', [{ episodeId: ep[key]!.id, day, ranges: [[0, atMs(key, f)]] }]);
    bump('listened_ranges');
  }
  // Library: favourites, favourite comments, moments, searches (the demo account only).
  const lib: LibraryIn[] = [];
  for (const [n, key] of FAV_EPISODES.entries()) lib.push({ kind: 'fav_episode', key: ep[key]!.id, payload: {}, updatedAt: ago(5 + n * 7).toISOString() });
  const favs = commentIds.filter((c) => c.who !== 'main').slice(0, 3);
  for (const [n, c] of favs.entries()) {
    const author = DEMO_ACCOUNTS.find((a) => a.key === c.who)!.name;
    lib.push({ kind: 'fav_comment', key: c.id, payload: { episodeId: ep[c.ep]!.id, body: c.body, author, offsetMs: c.offsetMs }, updatedAt: ago(4 + n * 5).toISOString() });
  }
  for (const [key, f, note, h] of MOMENTS) {
    const savedAt = ago(h).getTime();
    const ms = atMs(key, f);
    lib.push({ kind: 'moment', key: `${ep[key]!.id}@${ms}@${savedAt}`, payload: { episodeId: ep[key]!.id, atMs: ms, note, savedAt }, updatedAt: ago(h).toISOString() });
  }
  for (const [n, term] of SEARCHES.entries()) lib.push({ kind: 'search', key: term.toLowerCase(), payload: { term }, updatedAt: ago(1.5 + n * 9).toISOString() });
  o.setClock?.(now);
  await mergeLibrary(db, id.main, lib);
  bump('library_items', lib.length);
  counts['listeners'] = DEMO_ACCOUNTS.length;
  return { id, counts };
}

/**
 * The tables a `--prefix` names. `dev` and `qa` are real environments whose tables the API reads as `dev-main` / `qa-main`
 * (config.ts `tablesFor`); any other name is a scratch set (`prefixedTables`: `<name>_main`). M30: `qa` was missing here, so a qa seed
 * wrote `qa_main` while the qa API read `qa-main` and the demo login never matched.
 */
export const seedTables = (prefix: string) => (prefix === 'dev' || prefix === 'qa' ? tablesFor(prefix) : prefixedTables(prefix));

/** The backend from the flags: DynamoDB, `--prefix <set>` / `--prod` (with `--aws`), with a clock the seed moves. A leftover `--ddb` is ignored. */
export async function openBackend(argv: readonly string[]): Promise<{ db: Db; setClock?: (ms: number) => void; close(): Promise<void> }> {
  const args = parseArgs(argv);
  loadEnv();
  if (!args['prefix'] && !args['prod']) throw new Error('name the tables: --prefix <scratch> (dev = the dev loop) or --prod');
  const tables = typeof args['prefix'] === 'string' ? seedTables(args['prefix']) : PROD_TABLES;
  const clients = createDdbClients({ allowAws: args['aws'] === true });
  // M30 T019: every write the repos make goes through doc.send; a throttled one (1-WCU index) waits and retries.
  const sendOnce = clients.doc.send.bind(clients.doc) as (c: unknown, o?: unknown) => Promise<unknown>;
  (clients.doc as { send: unknown }).send = (c: unknown, o?: unknown) => withThrottleRetry(() => sendOnce(c, o));
  // On DynamoDB Local the tables may not exist yet: create the set for the prefix first.
  if (process.env['DDB_ENDPOINT'] && typeof args['prefix'] === 'string') {
    const { ListTablesCommand } = await import('@aws-sdk/client-dynamodb');
    const { createTableSet } = await import('../src/db/ddb/schema.ts');
    if (!((await clients.raw.send(new ListTablesCommand({}))).TableNames ?? []).includes(tables.main)) await createTableSet(clients.raw, tables);
  }
  let t = Date.now();
  const base = createStore({ clients, tables, secret: process.env['CURSOR_SECRET'] ?? 'seed-script' });
  const store: Store = { ...base, clock: { now: () => t } };
  return { db: withStore(undefined, store), setClock: (ms) => { t = ms; }, close: async () => { clients.raw.destroy(); } };
}

async function main(): Promise<void> {
  const b = await openBackend(process.argv.slice(2));
  try {
    const password = await readPassword();
    const { counts } = await seedDemo(b.db, { password, ...(b.setClock ? { setClock: b.setClock } : {}) });
    writeFileSync(LOGIN_FILE, `# Demo account (seed: apps/api/scripts/seed-demo.ts). Gitignored.\nDEMO_EMAIL=${DEMO_ACCOUNTS[0].email}\nDEMO_PASSWORD=${password}\n`, { mode: 0o600 });
    console.log('Demo seed done. Login written to apps/api/.env.demo-account (not printed).');
    for (const [t, n] of Object.entries(counts)) console.log(`  ${t}: ${n}`);
  } finally {
    await b.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
