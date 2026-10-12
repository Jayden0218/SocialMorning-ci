// Syncs subscriptions across devices; an unsubscribe wins a tie.
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
import { viaStore } from '../../backend.ts';

export type SubscriptionRow = {
  feed_url: string;
  starred: boolean;
  created_at: string;
  deleted_at: string | null;
  starred_at: string | null;
};

export type SubscriptionIn = {
  feedUrl: string;
  createdAt: string;
  deletedAt?: string | null;
  starred?: boolean;
  /** M12: when this phone last starred or unstarred the show. Absent from older builds. */
  starredAt?: string;
};

export type SubscriptionOut = {
  feedUrl: string;
  createdAt: string;
  deletedAt?: string;
  starred: boolean;
  starredAt?: string;
};

export const toPublic = (r: SubscriptionRow): SubscriptionOut => ({
  feedUrl: r.feed_url,
  createdAt: new Date(r.created_at).toISOString(),
  ...(r.deleted_at ? { deletedAt: new Date(r.deleted_at).toISOString() } : {}),
  starred: r.starred,
  ...(r.starred_at ? { starredAt: new Date(r.starred_at).toISOString() } : {}),
});

/** The row's own latest moment. A tombstone's stamp is its `deleted_at`. */
export const stampOf = (r: { createdAt: string; deletedAt?: string | null }): number =>
  new Date(r.deletedAt ?? r.createdAt).getTime();

export type PublicShow = { feedUrl: string; title: string | null; imageUrl: string | null };

// Each function runs on DynamoDB (`ddb/` bodies; db/backend.ts).
export const listAll = viaStore<typeof import('./ddb/subscriptions.ts').listAll>('lb/subscriptions', 'listAll');
export const merge = viaStore<typeof import('./ddb/subscriptions.ts').merge>('lb/subscriptions', 'merge');
export const setOrder = viaStore<typeof import('./ddb/subscriptions.ts').setOrder>('lb/subscriptions', 'setOrder');
export const getOrder = viaStore<typeof import('./ddb/subscriptions.ts').getOrder>('lb/subscriptions', 'getOrder');
export const publicSubscriptions = viaStore<typeof import('./ddb/subscriptions.ts').publicSubscriptions>('lb/subscriptions', 'publicSubscriptions');
