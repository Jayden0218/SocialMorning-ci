/**
 * M8 US1 — subscriptions as an account-level fact (specs/008-m8-for-you/research.md R1).
 *
 * Until M8 the server had never seen a subscription: `grep -r subscription apps/api/src`
 * returned nothing. The strongest personalisation signal in the product lived only on the
 * handset, and a lost phone was a lost library.
 *
 * The merge rule is the whole file. Per feed URL the winner is the row whose own latest
 * stamp — `deleted_at` if present, else `created_at` — is later. **A tie keeps the
 * tombstone**: an unsubscribe is the more recent intent a person expressed with their
 * thumb, and reviving a show someone removed is the worse failure of the two.
 *
 * A delete would not work here at all. Phone A unsubscribes and the row vanishes; phone B
 * still holds it and its next reconcile puts the show back. That is guard G-M2.
 */
import type { Db } from '../db.ts';

export type SubscriptionRow = {
  feed_url: string;
  starred: boolean;
  created_at: string;
  deleted_at: string | null;
};

export type SubscriptionIn = {
  feedUrl: string;
  createdAt: string;
  deletedAt?: string | null;
  starred?: boolean;
};

export type SubscriptionOut = {
  feedUrl: string;
  createdAt: string;
  deletedAt?: string;
  starred: boolean;
};

export const toPublic = (r: SubscriptionRow): SubscriptionOut => ({
  feedUrl: r.feed_url,
  createdAt: new Date(r.created_at).toISOString(),
  ...(r.deleted_at ? { deletedAt: new Date(r.deleted_at).toISOString() } : {}),
  starred: r.starred,
});

/** The row's own latest moment. A tombstone's stamp is its `deleted_at`. */
export const stampOf = (r: { createdAt: string; deletedAt?: string | null }): number =>
  new Date(r.createdAt).getTime();

/** Everything the account has ever had, tombstones included, so a phone can converge in one round trip. */
export async function listAll(db: Db, listenerId: string): Promise<SubscriptionRow[]> {
  return db.query<SubscriptionRow>(
    'SELECT feed_url, starred, created_at, deleted_at FROM subscriptions WHERE listener_id = $1 ORDER BY created_at DESC',
    [listenerId],
  );
}

/** The live ones only — what "subscribed" means everywhere else (guard G-M1). */
export async function listLive(db: Db, listenerId: string): Promise<SubscriptionRow[]> {
  return db.query<SubscriptionRow>(
    'SELECT feed_url, starred, created_at, deleted_at FROM subscriptions WHERE listener_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
    [listenerId],
  );
}

/**
 * Merge a device's set into the account's, then return the whole account set.
 * One transaction: a half-applied reconcile is a library in two states.
 */
export async function merge(db: Db, listenerId: string, items: readonly SubscriptionIn[]): Promise<SubscriptionRow[]> {
  if (items.length === 0) return listAll(db, listenerId);

  // A device may send the same feed twice (two tabs, a retry). Keep the later stamp.
  const incoming = new Map<string, SubscriptionIn>();
  for (const i of items) {
    const prev = incoming.get(i.feedUrl);
    if (prev === undefined || stampOf(i) >= stampOf(prev)) incoming.set(i.feedUrl, i);
  }

  return db.transaction(async (tx) => {
    const urls = [...incoming.keys()];
    const existing = await tx.query<SubscriptionRow>(
      'SELECT feed_url, starred, created_at, deleted_at FROM subscriptions WHERE listener_id = $1 AND feed_url = ANY($2::text[])',
      [listenerId, urls],
    );
    const have = new Map(existing.map((r) => [r.feed_url, r]));

    for (const [feedUrl, next] of incoming) {
      const cur = have.get(feedUrl);
      if (cur === undefined) {
        await tx.query(
          'INSERT INTO subscriptions (listener_id, feed_url, starred, created_at, deleted_at) VALUES ($1, $2, $3, $4, $5)',
          [listenerId, feedUrl, next.starred ?? false, next.createdAt, next.deletedAt ?? null],
        );
        continue;
      }
      const curStamp = stampOf({ createdAt: cur.created_at, deletedAt: cur.deleted_at });
      const nextStamp = stampOf(next);
      // Strictly later wins. On a tie the tombstone wins, whichever side holds it.
      const nextIsTombstone = (next.deletedAt ?? null) !== null;
      const curIsTombstone = cur.deleted_at !== null;
      const takeNext = nextStamp >= curStamp;
      if (!takeNext) continue;
      await tx.query(
        'UPDATE subscriptions SET created_at = $3, deleted_at = $4, starred = $5 WHERE listener_id = $1 AND feed_url = $2',
        [listenerId, feedUrl, next.createdAt, next.deletedAt ?? null, next.starred ?? cur.starred],
      );
    }

    return tx.query<SubscriptionRow>(
      'SELECT feed_url, starred, created_at, deleted_at FROM subscriptions WHERE listener_id = $1 ORDER BY created_at DESC',
      [listenerId],
    );
  });
}
