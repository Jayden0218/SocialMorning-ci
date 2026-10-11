// A show's team on DynamoDB: helpers, invited hosts, invite links, mutes and bans, curators, and giving the show back.
/**
 * M26 lane ST, ST-T01 (patterns ST-41…ST-44, ST-90…ST-96, ST-105…ST-109, ST-139…ST-149), data-model.md §3, §8.
 *
 * Under `SH#<feedKey>`: `TEAM#<listener>` (helper), `HOST#<listener>` (invited host), `INVITE#<id>`, `SMUTE#<listener>`
 * (mute / ban), and `TEAMV` — the team's version. The old advisory lock (`team|<feed>`) and the invite row's
 * `FOR UPDATE` become this one item: every helper or host change bumps `TEAMV` with `v = :seen`, so two tabs adding the
 * 10th helper (or two people accepting the 5th host invite) cannot both pass the count — the loser re-reads and is refused.
 * Each person keeps a pointer in their own partition (`ROLES#` for a helper, `HOSTOF#`, `SMUTEON#`) for account deletion.
 * Invite tokens are stored only as their hash: `U#INVITE#<sha256 hex>` → { owner: inviteId, feedUrl }.
 * Curators: one partition `CFG#curators` (the admin page lists them all; the app reads one by GetItem).
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ApiError } from '../../../../errors.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchWriteAll } from '../../../ddb/batch.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { tx, TxCancelled, type Tx } from '../../../ddb/tx.ts';
import { withRetry, isConditionFailed, isConflict } from '../../../ddb/retry.ts';
import { commitOrDefer } from '../../safety/ddb/admin-scope.ts';
import { INVITE_DAYS, MAX_HOSTS } from '../show-hosts.ts';
import { MAX_OPERATORS } from '../show-team.ts';
import type { BanRow } from '../show-bans.ts';
import type { Curator } from '../curators.ts';
import { showKey } from '../studio-roles.ts';
import { provenOf, revokeProven } from './claims.ts';
import { DAY_MS, isUuid, keyOf, listenersById, nowIso, nowMs, partition, str, visible, type Db } from './common.ts';

const hashOf = (token: string): string => createHash('sha256').update('invite|').update(token).digest('hex');

// ---- the team's version (the lock) ----

async function teamV(store: Store, feedUrl: string): Promise<number> {
  return Number((await get(store, 'main', K.teamVersion(feedUrl)))?.['v'] ?? 0);
}
function bumpTeam(t: Tx, feedUrl: string, seen: number): void {
  t.update('main', K.teamVersion(feedUrl), {
    update: 'SET #t = :t, #f = :f, #v = :n',
    condition: seen === 0 ? 'attribute_not_exists(#v) OR #v = :seen' : '#v = :seen',
    names: { '#t': 't', '#f': 'feedUrl', '#v': 'v' }, values: { ':t': 'teamVersion', ':f': feedUrl, ':n': seen + 1, ':seen': seen }, label: 'team',
  });
}
const retryTeam = <T>(fn: () => Promise<T>) => withRetry(fn, { tries: 6, retryOn: (e) => (e instanceof TxCancelled && e.failed('team')) || isConflict(e) });

// ---- helpers (operators) ----

export async function team(store: Store, _db: Db, feedUrl: string) {
  const [proven, members] = await Promise.all([provenOf(store, feedUrl), partition(store, 'main', K.SH(feedUrl), { prefix: 'TEAM#' })]);
  const people = await listenersById(store, [proven?.listenerId, ...members.map((m) => String(m['listenerId']))]);
  const owner = proven ? people.get(proven.listenerId) : undefined;
  const ops = members.filter((m) => people.has(String(m['listenerId']))).sort((a, b) => String(a['createdAt']).localeCompare(String(b['createdAt'])));
  return {
    owner: owner ? { id: String(owner['id']), displayName: String(owner['displayName']), email: String(owner['email']) } : null,
    operators: ops.map((m) => {
      const l = people.get(String(m['listenerId']))!;
      return { id: String(l['id']), displayName: String(l['displayName']), email: String(l['email']), addedAt: new Date(String(m['createdAt'])).toISOString() };
    }),
    slotsLeft: Math.max(0, MAX_OPERATORS - ops.length),
  };
}

/** Adds by exact email. The count and the insert share the team version, so two tabs cannot both take slot 10. */
export async function addOperator(store: Store, _db: Db, feedUrl: string, email: string, by: string): Promise<void> {
  const ownerRef = await get(store, 'main', K.U.email(email));
  const l = ownerRef ? await get(store, 'main', K.listener(String(ownerRef['owner']))) : undefined;
  if (!l || l['suspendedAt']) throw new ApiError('not_found', 'No SocialMorning account uses that email. Ask them to sign up in the app first.', { reason: 'no_account' });
  const id = String(l['id']);
  await retryTeam(async () => {
    const seen = await teamV(store, feedUrl);
    if ((await provenOf(store, feedUrl))?.listenerId === id) throw new ApiError('conflict', 'That is you — the owner already has every right.', { reason: 'already_member' });
    const members = await partition(store, 'main', K.SH(feedUrl), { prefix: 'TEAM#' });
    if (members.some((m) => m['listenerId'] === id)) throw new ApiError('conflict', 'They already help with this show.', { reason: 'already_member' });
    if (members.length >= MAX_OPERATORS) throw new ApiError('conflict', `A show can have ${MAX_OPERATORS} helpers.`, { reason: 'full' });
    const at = nowIso(store);
    const t = tx(store)
      .put('main', encode('teamMember', K.teamMember(feedUrl, id), { listenerId: id, feedUrl, addedBy: by, createdAt: at }, { gsi: K.G4('team-members', at, `${K.feedKey(feedUrl)}#${id}`) }), { condition: 'attribute_not_exists(PK)', label: 'team' })
      .put('main', encode('roles', K.roleCopy(id, showKey(feedUrl)), { feedUrl, role: 'operator', since: at, showKey: showKey(feedUrl) }));
    bumpTeam(t, feedUrl, seen);
    await t.commit();
  });
}

export async function removeOperator(store: Store, _db: Db, feedUrl: string, listenerId: string): Promise<void> {
  if (!isUuid(listenerId)) return;
  await retryTeam(async () => {
    if (!(await get(store, 'main', K.teamMember(feedUrl, listenerId)))) return;
    const seen = await teamV(store, feedUrl);
    const t = tx(store)
      .delete('main', K.teamMember(feedUrl, listenerId))
      .delete('main', K.roleCopy(listenerId, showKey(feedUrl)), { condition: 'attribute_not_exists(PK) OR #r = :op', names: { '#r': 'role' }, values: { ':op': 'operator' } });
    bumpTeam(t, feedUrl, seen);
    await t.commit();
  });
}

/**
 * Give the show back (FR-026): the claim is revoked — with the overrides, in one transaction — then the helpers, hosts
 * and mutes go, open invites are revoked and open polls close. Announcements and host hides stay as history.
 * The rest is idempotent clean-up: a crash half-way leaves nothing that grants anything (every role checks the claim).
 */
export async function release(store: Store, _db: Db, feedUrl: string): Promise<void> {
  await revokeProven(store, feedUrl, (t) => { t.delete('main', K.showSingleton(feedUrl, 'OVERRIDE')); });
  const sh = K.SH(feedUrl);
  const [members, hosts, mutes, invites, polls] = await Promise.all(['TEAM#', 'HOST#', 'SMUTE#', 'INVITE#', 'POLL#'].map((p) => partition(store, 'main', sh, { prefix: p })));
  const dels: { delete: { PK: string; SK: string } }[] = [];
  for (const m of members!) dels.push({ delete: keyOf(m) }, { delete: K.roleCopy(String(m['listenerId']), showKey(feedUrl)) });
  for (const h of hosts!) dels.push({ delete: keyOf(h) }, { delete: K.hostOf(String(h['listenerId']), feedUrl) });
  for (const m of mutes!) dels.push({ delete: keyOf(m) }, { delete: K.showMutePtr(String(m['listenerId']), feedUrl) });
  await batchWriteAll(store, 'main', dels);
  const at = nowIso(store);
  for (const i of invites!) {
    if (i['usedAt'] || i['revokedAt']) continue;
    await tx(store).update('main', keyOf(i), { update: 'SET #r = :at', condition: 'attribute_exists(PK) AND attribute_not_exists(#u) AND attribute_not_exists(#r)', names: { '#r': 'revokedAt', '#u': 'usedAt' }, values: { ':at': at } })
      .commit().catch((e: unknown) => { if (!isConditionFailed(e)) throw e; });
  }
  for (const p of polls!) {
    if (p['closedAt']) continue;
    await tx(store).update('main', keyOf(p), { update: 'SET #c = :at', condition: 'attribute_exists(PK) AND (attribute_not_exists(#c) OR attribute_type(#c, :nul))', names: { '#c': 'closedAt' }, values: { ':at': at, ':nul': 'NULL' } })
      .commit().catch((e: unknown) => { if (!isConditionFailed(e)) throw e; });
  }
}

// ---- invited hosts ----

export async function createInvite(store: Store, _db: Db, feedUrl: string, by: string): Promise<{ id: string; token: string; expiresAt: string }> {
  const token = randomBytes(24).toString('base64url');
  const id = randomUUID();
  const createdAt = nowIso(store);
  const expiresAt = new Date(nowMs(store) + INVITE_DAYS * DAY_MS).toISOString();
  await tx(store)
    .put('main', encode('invite', K.invite(feedUrl, id), { id, feedUrl, createdBy: by, createdAt, expiresAt, tokenHash: hashOf(token) }), { condition: 'attribute_not_exists(PK)' }) // lane LE: tokenHash for copy-back
    .put('main', encode('inviteToken', K.U.invite(hashOf(token)), { owner: id, feedUrl }), { condition: 'attribute_not_exists(PK)' })
    .commit();
  return { id, token, expiresAt };
}

export async function openInvites(store: Store, _db: Db, feedUrl: string) {
  const now = nowMs(store);
  return (await partition(store, 'main', K.SH(feedUrl), { prefix: 'INVITE#' }))
    .filter((i) => !i['usedAt'] && !i['revokedAt'] && Date.parse(String(i['expiresAt'])) > now)
    .sort((a, b) => String(b['createdAt']).localeCompare(String(a['createdAt'])))
    .map((i) => ({ id: String(i['id']), createdAt: new Date(String(i['createdAt'])).toISOString(), expiresAt: new Date(String(i['expiresAt'])).toISOString() }));
}

export async function revokeInvite(store: Store, _db: Db, feedUrl: string, id: string): Promise<void> {
  if (!isUuid(id)) return;
  await tx(store).update('main', K.invite(feedUrl, id), {
    update: 'SET #r = :at', condition: 'attribute_exists(PK) AND attribute_not_exists(#u)', names: { '#r': 'revokedAt', '#u': 'usedAt' }, values: { ':at': nowIso(store) },
  }).commit().catch((e: unknown) => { if (!isConditionFailed(e)) throw e; });
}

async function inviteOf(store: Store, token: string): Promise<Item | undefined> {
  const ref = await get(store, 'main', K.U.invite(hashOf(token)));
  return ref ? get(store, 'main', K.invite(String(ref['feedUrl']), String(ref['owner']))) : undefined;
}

/** A show's display title for an invite or a card: the live Studio-made show's, else the newest episode's (LB's show META). */
export async function showTitle(store: Store, feedUrl: string): Promise<string | null> {
  const ptr = await get(store, 'main', K.hostedFeed(feedUrl));
  if (ptr) {
    const h = await get(store, 'main', K.hostedShow(String(ptr['showId'])));
    if (h && !h['deletedAt']) return String(h['title']);
  }
  const meta = await get(store, 'main', K.show(feedUrl));
  if (meta?.['newestTitle']) return String(meta['newestTitle']);
  const latest = meta?.['latestEpisodeId'] ? await get(store, 'main', K.episode(String(meta['latestEpisodeId']))) : undefined;
  return str(latest?.['showTitle']) ?? str(latest?.['title']);
}

export async function previewInvite(store: Store, _db: Db, token: string) {
  const i = await inviteOf(store, token);
  if (!i) return { state: 'unknown' as const };
  const state = i['revokedAt'] ? 'revoked' : i['usedAt'] ? 'used' : Date.parse(String(i['expiresAt'])) <= nowMs(store) ? 'expired' : 'open';
  return { state, showTitle: await showTitle(store, String(i['feedUrl'])), expiresAt: new Date(String(i['expiresAt'])).toISOString() };
}

/** Accept: one use, not expired, not revoked, the show still claimed, under the host limit (guard G-I1). */
export async function acceptInvite(store: Store, _db: Db, token: string, listenerId: string): Promise<{ feedUrl: string }> {
  return withRetry(async () => {
    const i = await inviteOf(store, token);
    if (!i || i['revokedAt']) throw new ApiError('not_found', 'This invite link is not valid. Ask the show\'s owner for a new one.');
    if (i['usedAt']) throw new ApiError('conflict', 'This invite link was already used.', { reason: 'used' });
    if (Date.parse(String(i['expiresAt'])) <= nowMs(store)) throw new ApiError('conflict', 'This invite link has expired. Ask the show\'s owner for a new one.', { reason: 'expired' });
    const feedUrl = String(i['feedUrl']);
    const seen = await teamV(store, feedUrl);
    if (!(await provenOf(store, feedUrl))) throw new ApiError('not_found', 'This show no longer exists.');
    const hosts = await partition(store, 'main', K.SH(feedUrl), { prefix: 'HOST#' });
    if (hosts.length >= MAX_HOSTS) throw new ApiError('conflict', `A show can have ${MAX_HOSTS} hosts.`, { reason: 'full' });
    const at = nowIso(store);
    const t = tx(store)
      .update('main', keyOf(i), {
        update: 'SET #u = :at, #ub = :me', condition: 'attribute_not_exists(#u) AND attribute_not_exists(#r)',
        names: { '#u': 'usedAt', '#ub': 'usedBy', '#r': 'revokedAt' }, values: { ':at': at, ':me': listenerId }, label: 'invite',
      })
      .update('main', K.showHost(feedUrl, listenerId), {
        update: 'SET #t = :t, #l = :me, #f = :f, #a = if_not_exists(#a, :at)', names: { '#t': 't', '#l': 'listenerId', '#f': 'feedUrl', '#a': 'addedAt' },
        values: { ':t': 'showHost', ':me': listenerId, ':f': feedUrl, ':at': at },
      })
      .put('main', encode('hostPtr', K.hostOf(listenerId, feedUrl), { feedUrl, addedAt: at }))
      .check('main', K.U.proven(feedUrl), { condition: 'attribute_exists(PK)', label: 'proven' });
    bumpTeam(t, feedUrl, seen);
    await t.commit();
    return { feedUrl };
  }, { tries: 6, retryOn: (e) => (e instanceof TxCancelled && (e.failed('team') || e.failed('invite') || e.failed('proven'))) || isConflict(e) });
}

export async function listHosts(store: Store, _db: Db, feedUrl: string) {
  const hosts = await partition(store, 'main', K.SH(feedUrl), { prefix: 'HOST#' });
  const people = await listenersById(store, hosts.map((h) => String(h['listenerId'])));
  return hosts.filter((h) => people.has(String(h['listenerId'])))
    .sort((a, b) => String(a['addedAt']).localeCompare(String(b['addedAt'])))
    .map((h) => ({ id: String(h['listenerId']), displayName: String(people.get(String(h['listenerId']))!['displayName']), addedAt: new Date(String(h['addedAt'])).toISOString() }));
}

export async function removeHost(store: Store, _db: Db, feedUrl: string, listenerId: string): Promise<void> {
  if (!isUuid(listenerId)) return;
  await retryTeam(async () => {
    if (!(await get(store, 'main', K.showHost(feedUrl, listenerId)))) return;
    const seen = await teamV(store, feedUrl);
    const t = tx(store).delete('main', K.showHost(feedUrl, listenerId)).delete('main', K.hostOf(listenerId, feedUrl));
    bumpTeam(t, feedUrl, seen);
    await t.commit();
  });
}

// ---- mutes and bans (one table: `show_mutes`) ----

export async function banRows(store: Store, _db: Db, feedUrl: string): Promise<BanRow[]> {
  const mutes = await partition(store, 'main', K.SH(feedUrl), { prefix: 'SMUTE#' });
  const people = await listenersById(store, mutes.map((m) => String(m['listenerId'])));
  return mutes.filter((m) => people.has(String(m['listenerId'])))
    .sort((a, b) => String(b['createdAt']).localeCompare(String(a['createdAt'])))
    .map((m) => ({ id: String(m['listenerId']), display_name: String(people.get(String(m['listenerId']))!['displayName']), reason: str(m['reason']), created_at: String(m['createdAt']) }));
}

/** One row per team link (proven claim, helper, co-host) the listener has on the show. */
export async function teamRows(store: Store, _db: Db, feedUrl: string, listenerId: string): Promise<Record<string, unknown>[]> {
  if (!isUuid(listenerId)) return [];
  const [p, m, h] = await Promise.all([provenOf(store, feedUrl), get(store, 'main', K.teamMember(feedUrl, listenerId)), get(store, 'main', K.showHost(feedUrl, listenerId))]);
  return [p?.listenerId === listenerId, Boolean(m), Boolean(h)].filter(Boolean).map(() => ({ '?column?': 1 }));
}

export async function listenerExistsRows(store: Store, _db: Db, listenerId: string): Promise<Record<string, unknown>[]> {
  if (!isUuid(listenerId)) return [];
  return (await get(store, 'main', K.listener(listenerId))) ? [{ '?column?': 1 }] : [];
}

/** Mute a listener on a show; banning again only updates the reason (who muted and when stay). */
export async function upsertShowMute(store: Store, _db: Db, feedUrl: string, listenerId: string, by: string, reason: string | null): Promise<void> {
  await tx(store)
    .update('main', K.showMute(feedUrl, listenerId), {
      update: 'SET #t = :t, #l = :l, #f = :f, #r = :r, #b = if_not_exists(#b, :by), #c = if_not_exists(#c, :at)',
      names: { '#t': 't', '#l': 'listenerId', '#f': 'feedUrl', '#r': 'reason', '#b': 'mutedBy', '#c': 'createdAt' },
      values: { ':t': 'showMute', ':l': listenerId, ':f': feedUrl, ':r': reason, ':by': by, ':at': nowIso(store) },
    })
    .put('main', encode('showMutePtr', K.showMutePtr(listenerId, feedUrl), { feedUrl }))
    .commit();
}

export async function deleteShowMute(store: Store, _db: Db, feedUrl: string, listenerId: string): Promise<void> {
  if (!isUuid(listenerId)) return;
  await tx(store).delete('main', K.showMute(feedUrl, listenerId)).delete('main', K.showMutePtr(listenerId, feedUrl)).commit();
}

/** The owner and the show's operators cannot be muted on their own show. */
async function isMember(store: Store, feedUrl: string, listenerId: string): Promise<boolean> {
  const [p, m] = await Promise.all([provenOf(store, feedUrl), get(store, 'main', K.teamMember(feedUrl, listenerId))]);
  return p?.listenerId === listenerId || Boolean(m);
}

export async function mute(store: Store, _db: Db, feedUrl: string, listenerId: string, by: string): Promise<void> {
  if (!isUuid(listenerId) || !(await get(store, 'main', K.listener(listenerId)))) throw new ApiError('not_found', 'No such listener.');
  if (await isMember(store, feedUrl, listenerId)) throw new ApiError('conflict', 'The owner and helpers of a show cannot be muted on it.', { reason: 'cannot_mute_member' });
  try {
    await tx(store)
      .put('main', encode('showMute', K.showMute(feedUrl, listenerId), { listenerId, feedUrl, mutedBy: by, reason: null, createdAt: nowIso(store) }), { condition: 'attribute_not_exists(PK)', label: 'mute' })
      .put('main', encode('showMutePtr', K.showMutePtr(listenerId, feedUrl), { feedUrl }))
      .commit();
  } catch (e) {
    if (!(e instanceof TxCancelled && e.failed('mute'))) throw e; // already muted: nothing to do (ON CONFLICT DO NOTHING)
  }
}

export async function unmute(store: Store, db: Db, feedUrl: string, listenerId: string): Promise<void> {
  await deleteShowMute(store, db, feedUrl, listenerId);
}

export async function listMutes(store: Store, _db: Db, feedUrl: string) {
  const mutes = await partition(store, 'main', K.SH(feedUrl), { prefix: 'SMUTE#' });
  const people = await listenersById(store, mutes.flatMap((m) => [String(m['listenerId']), str(m['mutedBy'])]));
  return {
    items: mutes.filter((m) => people.has(String(m['listenerId'])))
      .sort((a, b) => String(b['createdAt']).localeCompare(String(a['createdAt'])))
      .map((m) => {
        const by = str(m['mutedBy']);
        return { id: String(m['listenerId']), displayName: String(people.get(String(m['listenerId']))!['displayName']), mutedAt: new Date(String(m['createdAt'])).toISOString(), mutedBy: by ? str(people.get(by)?.['displayName']) : null };
      }),
  };
}

export async function isMutedOn(store: Store, _db: Db, feedUrl: string, listenerId: string): Promise<boolean> {
  return isUuid(listenerId) && Boolean(await get(store, 'main', K.showMute(feedUrl, listenerId)));
}

// ---- curators (M15) ----

export async function curatorFor(store: Store, _db: Db, feedUrl: string): Promise<Curator | null> {
  const c = await get(store, 'main', K.curator(feedUrl));
  if (!c) return null;
  const l = (await listenersById(store, [String(c['listenerId'])])).get(String(c['listenerId']));
  return visible(l) ? { id: String(l['id']), displayName: String(l['displayName']) } : null;
}

export async function listCurators(store: Store, _db: Db): Promise<{ feedUrl: string; curator: Curator; createdAt: string }[]> {
  const all = await partition(store, 'main', 'CFG#curators');
  const people = await listenersById(store, all.map((c) => String(c['listenerId'])));
  return all.filter((c) => people.has(String(c['listenerId'])))
    .sort((a, b) => String(b['createdAt']).localeCompare(String(a['createdAt'])))
    .map((c) => {
      const l = people.get(String(c['listenerId']))!;
      return { feedUrl: String(c['feedUrl']), curator: { id: String(l['id']), displayName: String(l['displayName']) }, createdAt: new Date(String(c['createdAt'])).toISOString() };
    });
}

/** Sets (or, with `null`, removes) the show's curator — inside an admin write, in the admin record's transaction. */
export async function setCurator(store: Store, _db: Db, feedUrl: string, listenerId: string | null, by: string): Promise<void> {
  const t = tx(store);
  if (listenerId === null) t.delete('main', K.curator(feedUrl));
  else t.put('main', encode('curator', K.curator(feedUrl), { feedUrl, listenerId, createdBy: by, createdAt: nowIso(store) }));
  await commitOrDefer(store, t);
}

export { visible };
