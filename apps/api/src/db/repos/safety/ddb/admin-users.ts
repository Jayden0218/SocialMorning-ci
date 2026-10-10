// Admin › users on DynamoDB: the search in memory over the listener queue, one account from AC's items, reports against from G1.
/**
 * M26 lane SF (SF-86…SF-102; data-model.md §14). The search is the SQL's rule run in code: name OR email contains
 * the text (case-insensitive, the `\` `%` `_` escapes undone), names starting with it first, then by lower name, id;
 * 50 at most — over every listener of G4 `Q#listeners` (owner-only and rare; a scale limit near 50 000 listeners,
 * the upgrade is a search service). Listener writes go through lane AC's repo (rename, bio, photo). PLUS, purchases,
 * tips, gifts (lane PD) and the Studio shows (lane ST) are still Postgres rows: those functions stay SQL.
 */
import * as K from '../../../ddb/keys.ts';
import { get } from '../../../ddb/store.ts';
import { setAvatar, updateProfile } from '../../account/profile.ts';
import type { PendingDeletionRow, UserRow } from '../../admin/admin-users.ts';
import { reportsAbout, reportsOnTarget } from './reports.ts';
import { hostedShowsOf } from './foreign.ts';
import { getMany, isUuid, listenersById, partition, pgOf, queue, type Db, type Item, type Store } from './common.ts';

const userRow = (l: Item): UserRow => ({
  id: String(l['id']), display_name: String(l['displayName']), email: String(l['email']), created_at: String(l['createdAt']),
  suspended_at: (l['suspendedAt'] as string | null | undefined) ?? null, made_by: (l['madeBy'] as string | null | undefined) ?? null,
});

const listener = (store: Store, id: string) => (isUuid(id) ? get(store, 'main', K.listener(id)) : Promise.resolve(undefined));

export async function userRowById(store: Store, _db: Db, id: string): Promise<UserRow[]> {
  const l = await listener(store, id);
  return l ? [userRow(l)] : [];
}

/** `like` is the search text with `\`, `%` and `_` escaped (the route's form, kept). */
export async function searchUsers(store: Store, _db: Db, like: string): Promise<UserRow[]> {
  const q = like.replace(/\\([\\%_])/g, '$1').toLowerCase();
  const hits = (await queue(store, 'listeners'))
    .filter((l) => String(l['displayName'] ?? '').toLowerCase().includes(q) || String(l['email'] ?? '').toLowerCase().includes(q));
  const items = await getMany(store, 'main', hits.map((l) => K.listener(String(l['id']))));
  const rows = items.map(userRow).filter((r) => r.display_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
  rows.sort((a, b) => {
    const pa = a.display_name.toLowerCase().startsWith(q) ? 0 : 1;
    const pb = b.display_name.toLowerCase().startsWith(q) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const na = a.display_name.toLowerCase(); const nb = b.display_name.toLowerCase();
    if (na !== nb) return na < nb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return rows.slice(0, 50);
}

export async function renameListener(_store: Store, db: Db, id: string, displayName: string): Promise<void> {
  await updateProfile(db, id, { displayName });
}

export async function profileExtras(store: Store, _db: Db, id: string): Promise<{ avatar_url: string | null; bio: string | null; sessions: number }[]> {
  const l = await listener(store, id);
  if (!l) return [];
  const sessions = (await partition(store, 'main', K.L(id), { prefix: K.LISTENER_SK.sessions })).length;
  return [{ avatar_url: (l['avatarUrl'] as string | undefined) ?? null, bio: (l['bio'] as string | undefined) ?? null, sessions }];
}

export async function reportsAgainst(store: Store, _db: Db, id: string): Promise<{ id: string; target_kind: string; target_id: string; reason: string; created_at: Date | string; close_reason: string | null }[]> {
  if (!isUuid(id)) return [];
  return (await reportsAbout(store, id))
    .sort((a, b) => (String(a['createdAt']) < String(b['createdAt']) ? 1 : -1))
    .map((r) => ({ id: String(r['id']), target_kind: String(r['targetKind']), target_id: String(r['targetId']), reason: String(r['reason']), created_at: String(r['createdAt']), close_reason: (r['closeReason'] as string | null | undefined) ?? null }));
}

const deletionOf = (store: Store, id: string) => get(store, 'main', K.listenerSingleton(id, 'DELETION'));

export async function openDeletionOf(store: Store, _db: Db, id: string): Promise<{ requested_at: Date | string; due_at: Date | string }[]> {
  if (!isUuid(id)) return [];
  const d = await deletionOf(store, id);
  return d && !d['cancelledAt'] ? [{ requested_at: String(d['requestedAt']), due_at: String(d['dueAt']) }] : [];
}

export async function studioShowsOf(store: Store, db: Db, id: string): Promise<{ feed_url: string; title: string; hidden: boolean }[]> {
  const shows = await hostedShowsOf(pgOf(db), id);
  const hidden = new Set((await getMany(store, 'main', [...new Set(shows.map((s) => s.feed_url))].map((u) => K.hiddenFeed(u)))).map((i) => String(i['feedUrl'])));
  return shows.map((s) => ({ feed_url: s.feed_url, title: s.title, hidden: hidden.has(s.feed_url) }));
}

export async function avatarUrlOf(store: Store, _db: Db, id: string): Promise<{ avatar_url: string | null }[]> {
  const l = await listener(store, id);
  return l ? [{ avatar_url: (l['avatarUrl'] as string | undefined) ?? null }] : [];
}

export async function clearAvatar(_store: Store, db: Db, id: string): Promise<Record<string, unknown>[]> {
  await setAvatar(db, id, null);
  return [];
}

export async function clearBio(_store: Store, db: Db, id: string): Promise<Record<string, unknown>[]> {
  await updateProfile(db, id, { bio: '' });
  return [];
}

export async function openReportCount(store: Store, _db: Db, kind: string, id: string): Promise<{ n: number }[]> {
  return [{ n: (await reportsOnTarget(store, kind, id)).filter((r) => !r['closedAt']).length }];
}

/** The account deletion queue (US7), soonest first: lane AC's DELETION items still waiting (G4 `Q#deletions`). */
export async function pendingDeletions(store: Store, _db: Db): Promise<PendingDeletionRow[]> {
  const queued = await queue(store, 'deletions', { max: 500 });
  const items = (await getMany(store, 'main', queued.map((d) => K.listenerSingleton(String(d['listenerId']), 'DELETION')))).filter((d) => !d['cancelledAt']);
  const people = await listenersById(store, items.map((d) => String(d['listenerId'])));
  return items.flatMap((d) => {
    const l = people.get(String(d['listenerId']));
    return l ? [{ listener_id: String(l['id']), display_name: String(l['displayName']), email: String(l['email']), requested_at: String(d['requestedAt']), due_at: String(d['dueAt']) }] : [];
  }).sort((a, b) => (a.due_at < b.due_at ? -1 : a.due_at > b.due_at ? 1 : 0));
}
