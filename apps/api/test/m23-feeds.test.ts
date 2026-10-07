// Tests feed fetching limits (timeout, size cap, charsets), the sweep step, and moved or blocked feeds.
/**
 * M23 US5 / US3 / US11 (lane L2).
 *
 * Guard G-M23-7 — a feed that never answers is given up after 8 s and the other feeds in the
 * same call still refresh. The break that turns it red: in `routes/internal.ts` replace the
 * `Promise.allSettled` groups with a plain `for … await refreshOne(…)` and drop the
 * `withDeadline` race in `catalog/feed.ts` (`fetchFeed` then waits for ever).
 */
import { FEED_MAX_BYTES } from '@socialmorning/feed-parser';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp } from './harness.ts';
import { fetchFeed } from '../src/catalog/feed.ts';
import { hiddenFeedUrls } from '../src/db/repos/safety/moderation.ts';

const JOB = 'job-token-not-secret';
const auth = { authorization: `Bearer ${JOB}` };
const ascii = (s: string) => Array.from(s, (ch) => ch.charCodeAt(0));
const xmlOf = (title: number[], extra = '', decl = '<?xml version="1.0"?>') => new Uint8Array([
  ...ascii(`${decl}<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>`),
  ...title,
  ...ascii(`</title>${extra}<item><title>One</title><guid>g1</guid><pubDate>Tue, 10 Sep 2024 09:00:00</pubDate><enclosure url="https://cdn/1.mp3" type="audio/mpeg"/></item></channel></rss>`),
]);
const plain = (title: string, extra = '') => xmlOf(ascii(title), extra);
const respond = (bytes: Uint8Array<ArrayBuffer>, contentType = 'application/rss+xml') => new Response(bytes, { status: 200, headers: { 'content-type': contentType } });

// 你好 in GBK is C4 E3 BA C3; in Big5 A7 41 A6 6E. "Café" in Latin-1 ends in E9.
const NIHAO_GBK = [0xc4, 0xe3, 0xba, 0xc3];
const NIHAO_BIG5 = [0xa7, 0x41, 0xa6, 0x6e];
const CAFE_LATIN1 = [0x43, 0x61, 0x66, 0xe9];

test('G-M23-7: a feed that never answers is given up after 8 s, and the next feeds still refresh in the same run', async () => {
  const HANG = 'https://feeds.example.com/a-hangs.xml';
  const good = ['https://feeds.example.com/b.xml', 'https://feeds.example.com/c.xml', 'https://feeds.example.com/d.xml'];
  // The hanging fetch ignores its abort signal on purpose: the deadline must hold anyway.
  const catalogFetch = (async (input: string | URL | Request) =>
    String(input) === HANG ? new Promise<Response>(() => undefined) : respond(plain(`Show ${String(input).slice(-5)}`))) as typeof fetch;
  const t = await freshDb({ jobToken: JOB, catalogFetch });
  const a = await signUp(t);
  await t.call('PUT', '/v1/me/subscriptions', { items: [HANG, ...good].map((feedUrl) => ({ feedUrl, createdAt: '2026-10-01T00:00:00.000Z' })) }, a.token);

  const startedAt = Date.now();
  const res = await t.call('POST', '/v1/internal/rebuild', { step: 'feeds' }, undefined, auth);
  const took = Date.now() - startedAt;
  assert.equal(res.status, 200);
  const body = (await res.json()) as { done: boolean; counts: { feeds: number; registered: number; failed: number } };
  assert.equal(body.counts.feeds, 4);
  assert.equal(body.counts.failed, 1, 'only the hanging feed failed');
  assert.equal(body.counts.registered, 3, 'the three feeds after it were registered');
  assert.ok(took >= 7_500 && took < 20_000, `gave up at the 8 s deadline (${took} ms)`);
  const shows = await t.q<{ feed_url: string }>('SELECT DISTINCT feed_url FROM episodes ORDER BY feed_url');
  assert.deepEqual(shows.map((r) => r.feed_url), good);
  await t.close();
});

test('US5: the deadline also covers a feed that sends headers and then stalls', async () => {
  const t = await freshDb();
  const stall = (async (_i: string | URL | Request, init?: RequestInit) => new Response(new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(plain('x').slice(0, 20));
      init?.signal?.addEventListener('abort', () => c.error(init.signal!.reason));
    },
  }), { status: 200 })) as typeof fetch;
  await assert.rejects(fetchFeed(t.db, stall, 'https://feeds.example.com/stall.xml', { timeoutMs: 100 }), /no answer in 100 ms/);
  await t.close();
});

test('US5: GBK, GB2312 (by XML declaration), Big5 and ISO-8859-1 feeds read correctly', async () => {
  const t = await freshDb();
  const cases: [string, Uint8Array<ArrayBuffer>, string, string][] = [
    ['gbk-header', xmlOf(NIHAO_GBK), 'application/rss+xml; charset=GBK', '你好'],
    ['gb2312-declaration', xmlOf(NIHAO_GBK, '', '<?xml version="1.0" encoding="GB2312"?>'), 'text/xml', '你好'],
    // A server that says UTF-8 over GBK bytes yields to the feed's own declaration.
    ['wrong-header', xmlOf(NIHAO_GBK, '', '<?xml version="1.0" encoding="gbk"?>'), 'text/xml; charset=utf-8', '你好'],
    ['big5', xmlOf(NIHAO_BIG5), 'application/xml; charset=big5', '你好'],
    ['latin1', xmlOf(CAFE_LATIN1, '', "<?xml version='1.0' encoding='ISO-8859-1'?>"), 'application/rss+xml', 'Café'],
  ];
  for (const [name, bytes, type, want] of cases) {
    const { feed } = await fetchFeed(t.db, (async () => respond(bytes, type)) as typeof fetch, `https://feeds.example.com/${name}.xml`);
    assert.equal(feed.show.title, want, name);
  }
  await t.close();
});

test('US5: a feed over the cap (20 MB) is refused — by its Content-Length, and while streaming when it has none', async () => {
  const t = await freshDb();
  const big = new Uint8Array(FEED_MAX_BYTES + 1).fill(0x20);
  const declared = (async () => new Response(plain('x'), { status: 200, headers: { 'content-length': String(big.length) } })) as typeof fetch;
  await assert.rejects(fetchFeed(t.db, declared, 'https://feeds.example.com/declared.xml'), new RegExp(`over ${FEED_MAX_BYTES} bytes`));
  let cancelled = false;
  const streamed = (async () => new Response(new ReadableStream<Uint8Array>({
    pull(c) { c.enqueue(big.subarray(0, 1024 * 1024)); },
    cancel() { cancelled = true; },
  }), { status: 200 })) as typeof fetch;
  await assert.rejects(fetchFeed(t.db, streamed, 'https://feeds.example.com/streamed.xml'), new RegExp(`over ${FEED_MAX_BYTES} bytes`));
  assert.ok(cancelled, 'the download stopped at the cap');
  await t.close();
});

test('US5: a pubDate with no zone is read as UTC (the same on the phone and the server)', async () => {
  const t = await freshDb();
  const { feed } = await fetchFeed(t.db, (async () => respond(plain('Dates'))) as typeof fetch, 'https://feeds.example.com/dates.xml');
  assert.equal(feed.episodes[0]!.publishedAt, Date.UTC(2024, 8, 10, 9));
  await t.close();
});

test('US3/US5: the sweep step deletes old caches, push_sent and rec_events — and only those', async () => {
  const t = await freshDb({ jobToken: JOB });
  const a = await signUp(t);
  await t.q(`INSERT INTO cache (key, body, fetched_at) VALUES
    ('apple:search:shows:old', '[]', now() - interval '8 days'), ('apple:search:shows:new', '[]', now() - interval '6 days'),
    ('feed:https://old', '{}', now() - interval '8 days'), ('feed:https://new', '{}', now()),
    ('feed-block:https://kept', '{}', now() - interval '100 days'), ('chart:v1:x', '{}', now() - interval '100 days')`);
  await t.q(`INSERT INTO push_sent (listener_id, episode_id, kind, sent_at) VALUES ($1, 'e-old', 'popular', now() - interval '31 days'), ($1, 'e-new', 'popular', now() - interval '29 days')`, [a.id]);
  await t.q(`INSERT INTO rec_events (listener_id, episode_id, channel, rank, kind, at) VALUES ($1, 'e-old', 'pick', 0, 'open', now() - interval '91 days'), ($1, 'e-new', 'pick', 0, 'open', now() - interval '89 days')`, [a.id]);

  const res = await t.call('POST', '/v1/internal/rebuild', { step: 'sweep' }, undefined, auth);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { done: boolean; counts: { cacheDeleted: number; pushSentDeleted: number; recEventsDeleted: number } };
  assert.equal(body.done, true);
  assert.deepEqual([body.counts.cacheDeleted, body.counts.pushSentDeleted, body.counts.recEventsDeleted], [2, 1, 1]);
  assert.deepEqual((await t.q<{ key: string }>('SELECT key FROM cache ORDER BY key')).map((r) => r.key),
    ['apple:search:shows:new', 'chart:v1:x', 'feed-block:https://kept', 'feed:https://new']);
  assert.deepEqual((await t.q<{ episode_id: string }>('SELECT episode_id FROM push_sent')).map((r) => r.episode_id), ['e-new']);
  assert.deepEqual((await t.q<{ episode_id: string }>('SELECT episode_id FROM rec_events')).map((r) => r.episode_id), ['e-new']);
  await t.close();
});

test('US5: the feeds step no longer does the housekeeping', async () => {
  const t = await freshDb({ jobToken: JOB });
  const a = await signUp(t);
  await t.q(`INSERT INTO push_sent (listener_id, episode_id, kind, sent_at) VALUES ($1, 'e-old', 'popular', now() - interval '31 days')`, [a.id]);
  const res = await t.call('POST', '/v1/internal/rebuild', { step: 'feeds' }, undefined, auth);
  assert.equal(res.status, 200);
  assert.equal((await t.q('SELECT 1 FROM push_sent')).length, 1);
  await t.close();
});

test('US11: itunes:new-feed-url moves the subscribers; itunes:block hides the show and registers nothing', async () => {
  const OLD = 'https://feeds.example.com/old.xml';
  const NEW = 'https://feeds.example.com/new.xml';
  const BLOCKED = 'https://feeds.example.com/blocked.xml';
  let blocked = true;
  const catalogFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === OLD) return respond(plain('Moving', `<itunes:new-feed-url>${NEW}</itunes:new-feed-url>`));
    if (url === BLOCKED) return respond(plain('Hidden', blocked ? '<itunes:block>Yes</itunes:block>' : ''));
    return respond(plain('Other'));
  }) as typeof fetch;
  const t = await freshDb({ jobToken: JOB, catalogFetch });
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bea');
  await t.call('PUT', '/v1/me/subscriptions', { items: [OLD, BLOCKED].map((feedUrl) => ({ feedUrl, createdAt: '2026-10-01T00:00:00.000Z' })) }, a.token);
  await t.call('PUT', '/v1/me/subscriptions', { items: [OLD, NEW].map((feedUrl) => ({ feedUrl, createdAt: '2026-10-01T00:00:00.000Z' })) }, b.token);

  const res = await t.call('POST', '/v1/internal/rebuild', { step: 'feeds' }, undefined, auth);
  const counts = ((await res.json()) as { counts: { moved: number; blocked: number } }).counts;
  assert.equal(counts.moved, 2);
  assert.equal(counts.blocked, 1);
  const live = await t.q<{ email: string; feed_url: string }>(
    'SELECT l.email::text AS email, s.feed_url FROM subscriptions s JOIN listeners l ON l.id = s.listener_id WHERE s.deleted_at IS NULL ORDER BY 1, 2');
  assert.deepEqual(live.map((r) => [r.email, r.feed_url]), [['a@example.com', BLOCKED], ['a@example.com', NEW], ['b@example.com', NEW]]);
  const events = await t.q<{ feed_url: string; kind: string }>("SELECT feed_url, kind FROM subscription_events WHERE kind = 'unsub' AND feed_url = $1", [OLD]);
  assert.equal(events.length, 2, 'the Studio sees both leave the old address');

  assert.ok((await hiddenFeedUrls(t.db)).has(BLOCKED));
  assert.equal((await t.q('SELECT 1 FROM episodes WHERE feed_url = $1', [BLOCKED])).length, 0, 'a blocked show registers nothing');

  blocked = false;
  await t.q("DELETE FROM cache WHERE key LIKE 'feed:%'");
  await t.call('POST', '/v1/internal/rebuild', { step: 'feeds' }, undefined, auth);
  assert.equal((await hiddenFeedUrls(t.db)).has(BLOCKED), false, 'the mark goes when the feed stops asking');
  await t.close();
});
