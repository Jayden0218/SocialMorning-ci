// Lets a creator claim a show by placing a code in their live feed.
/**
 * M10b US8 — a creator claims the show they already publish (owner, 2026-09-27: "Claim your
 * feed"; nothing is uploaded — Principle V). SocialNet hands out a code; the creator puts it
 * anywhere in their feed (the channel description or a `<podcast:txt>` tag is the usual place);
 * verify re-reads the feed from the publisher and looks for it (guard G-C1: only the code in
 * the live feed proves ownership). One proven claim per feed.
 */
import { randomBytes } from 'node:crypto';
import { FEED_TIMEOUT_MS, readFeedText } from '@socialmorning/feed-parser';
import { USER_AGENT, withDeadline } from '../../../catalog/feed.ts';
import type { Db } from '../../db.ts';

export type Claim = { id: string; feedUrl: string; code: string; status: 'pending' | 'proven' | 'revoked'; provenAt?: string };

const toClaim = (r: { id: string; feed_url: string; code: string; status: Claim['status']; proven_at: string | Date | null }): Claim => ({
  id: r.id, feedUrl: r.feed_url, code: r.code, status: r.status, ...(r.proven_at ? { provenAt: new Date(r.proven_at).toISOString() } : {}),
});

export const newCode = (): string => `socialnet-verify-${randomBytes(6).toString('hex')}`;

export async function createClaim(db: Db, listenerId: string, feedUrl: string): Promise<Claim> {
  const [existing] = await db.query<{ id: string; feed_url: string; code: string; status: Claim['status']; proven_at: string | null }>(
    "SELECT id, feed_url, code, status, proven_at FROM creator_claims WHERE listener_id = $1 AND feed_url = $2 AND status <> 'revoked' ORDER BY created_at DESC LIMIT 1",
    [listenerId, feedUrl],
  );
  if (existing) return toClaim(existing);
  const [r] = await db.query<{ id: string; feed_url: string; code: string; status: Claim['status']; proven_at: string | null }>(
    'INSERT INTO creator_claims (listener_id, feed_url, code) VALUES ($1, $2, $3) RETURNING id, feed_url, code, status, proven_at',
    [listenerId, feedUrl, newCode()],
  );
  return toClaim(r!);
}

export async function myClaims(db: Db, listenerId: string): Promise<Claim[]> {
  const rows = await db.query<{ id: string; feed_url: string; code: string; status: Claim['status']; proven_at: string | null }>(
    "SELECT id, feed_url, code, status, proven_at FROM creator_claims WHERE listener_id = $1 AND status <> 'revoked' ORDER BY created_at DESC",
    [listenerId],
  );
  return rows.map(toClaim);
}

/** M25 S7: a claim check reads at most this much of the feed. */
export const CLAIM_MAX_BYTES = 5 * 1024 * 1024;

/** 'proven' only when the code is in the feed's text as the publisher serves it now. */
export async function verifyClaim(db: Db, f: typeof fetch, listenerId: string, id: string): Promise<{ status: Claim['status'] } | 'not_found' | 'taken'> {
  const [c] = await db.query<{ id: string; feed_url: string; code: string; status: Claim['status'] }>(
    'SELECT id, feed_url, code, status FROM creator_claims WHERE id = $1 AND listener_id = $2', [id, listenerId]);
  if (!c) return 'not_found';
  if (c.status === 'proven') return { status: 'proven' };
  // M25 S7 (audit #10): the same 8 s deadline and size cap as a feed refresh; `f` is the
  // SSRF-guarded catalogue fetch (net/safe-fetch.ts), so a claim cannot point at a private address.
  const text = await withDeadline(FEED_TIMEOUT_MS, `claim ${c.feed_url}`, async (signal) => {
    const res = await f(c.feed_url, { signal, headers: { accept: 'application/rss+xml, application/xml, text/xml', 'user-agent': USER_AGENT } });
    if (!res.ok) return undefined;
    return readFeedText(res, (label, fatal) => new TextDecoder(label, { fatal }), CLAIM_MAX_BYTES);
  });
  if (text === undefined) return { status: 'pending' };
  if (!text.includes(c.code)) return { status: 'pending' };
  const [other] = await db.query<{ id: string }>("SELECT id FROM creator_claims WHERE feed_url = $1 AND status = 'proven' AND id <> $2", [c.feed_url, c.id]);
  if (other) return 'taken';
  await db.query("UPDATE creator_claims SET status = 'proven', proven_at = now() WHERE id = $1", [c.id]);
  return { status: 'proven' };
}

export async function isProvenOwner(db: Db, listenerId: string, feedUrl: string): Promise<boolean> {
  const r = await db.query("SELECT 1 FROM creator_claims WHERE listener_id = $1 AND feed_url = $2 AND status = 'proven'", [listenerId, feedUrl]);
  return r.length > 0;
}

/** The claimant's view of their show: who listened, how many comments, where people react. Counts only — no names. */
export async function showStats(db: Db, feedUrl: string): Promise<{ listeners: number; comments: number; episodes: number; topMoments: { episodeId: string; title: string; offsetMs: number; comments: number }[] }> {
  const [l] = await db.query<{ n: number }>(
    "SELECT count(DISTINCT a.actor_id)::int AS n FROM activity a JOIN episodes e ON e.id = a.episode_id WHERE e.feed_url = $1 AND a.kind = 'listened'", [feedUrl]);
  const [cm] = await db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM comments c JOIN episodes e ON e.id = c.episode_id WHERE e.feed_url = $1 AND c.deleted_at IS NULL AND c.removed_at IS NULL AND c.host_hidden_at IS NULL', [feedUrl]);
  const [ep] = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM episodes WHERE feed_url = $1', [feedUrl]);
  const top = await db.query<{ episode_id: string; title: string; minute: number; n: number }>(
    `SELECT e.id AS episode_id, e.title, (c.offset_ms / 60000) * 60000 AS minute, count(*)::int AS n
     FROM comments c JOIN episodes e ON e.id = c.episode_id
     WHERE e.feed_url = $1 AND c.offset_ms IS NOT NULL AND c.deleted_at IS NULL AND c.removed_at IS NULL AND c.host_hidden_at IS NULL
     GROUP BY e.id, e.title, minute ORDER BY n DESC, e.id LIMIT 5`, [feedUrl]);
  return { listeners: l?.n ?? 0, comments: cm?.n ?? 0, episodes: ep?.n ?? 0, topMoments: top.map((t) => ({ episodeId: t.episode_id, title: t.title, offsetMs: Number(t.minute), comments: t.n })) };
}

/** The proven claimant of an episode's show, if any — for the "Host" mark on their comments. */
export async function hostOfEpisode(db: Db, episodeId: string): Promise<string | undefined> {
  const [r] = await db.query<{ listener_id: string }>(
    "SELECT cl.listener_id FROM creator_claims cl JOIN episodes e ON e.feed_url = cl.feed_url WHERE e.id = $1 AND cl.status = 'proven' LIMIT 1", [episodeId]);
  return r?.listener_id;
}

/** M14 (FR-03): everyone who carries the Host mark on an episode's show — the proven owner and invited hosts. */
export async function hostsOfEpisode(db: Db, episodeId: string): Promise<string[]> {
  const rows = await db.query<{ id: string }>(
    `SELECT cl.listener_id AS id FROM creator_claims cl JOIN episodes e ON e.feed_url = cl.feed_url WHERE e.id = $1 AND cl.status = 'proven'
     UNION SELECT h.listener_id FROM show_hosts h JOIN episodes e ON e.feed_url = h.feed_url WHERE e.id = $1
       AND EXISTS (SELECT 1 FROM creator_claims c2 WHERE c2.feed_url = h.feed_url AND c2.status = 'proven')`,
    [episodeId]);
  return rows.map((r) => r.id).sort();
}
