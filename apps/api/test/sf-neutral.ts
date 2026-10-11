// Lane SF test helpers that work on both backends: Postgres SQL today, DynamoDB items when the test runs hybrid (TEST_BACKEND=ddb).
/**
 * M26 lane SF. The safety/admin tests seed and assert rows of lane SF's tables (reports, moderation actions,
 * admins, the admin record) and a few listener columns. With `t.store` each helper reads/writes the items (through
 * test/fixtures.ts and src/db/ddb — loaded dynamically, so the Postgres coverage run never loads them), otherwise
 * the SQL the test used to inline. CUT deletes the Postgres branches.
 */
import type { TestDb } from './harness.ts';

type Row = Record<string, unknown>;
const fx = () => import('./fixtures.ts');
const keys = () => import('../src/db/ddb/keys.ts');
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const asRow = (i: Row): Row => {
  const out: Row = {};
  for (const [k, v] of Object.entries(i)) if (!/^(PK|SK|t|ttl|G\d(PK|SK)|E1(PK|SK))$/.test(k)) out[snake(k)] = v;
  return out;
};

/** Every audit record, oldest first, with its `after` sibling merged (DynamoDB) — the full admin_audit rows. */
export async function auditFull(t: TestDb): Promise<{ id: string; admin_id: string; acting_as: string | null; area: string; action: string; target: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; device: string | null }[]> {
  if (!t.store) {
    return (await t.q<{ id: string; admin_id: string; acting_as: string | null; area: string; action: string; target: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; device: string | null }>(
      'SELECT id::text, admin_id, acting_as, area, action, target, before, after, device FROM admin_audit ORDER BY id'));
  }
  const items = await (await fx()).acScan(t.store, 'main', 'audit');
  const afters = new Map<number, unknown>();
  for (const i of items) if (String(i['SK']).endsWith('#after')) afters.set(Number(i['id']), i['after']);
  return items.filter((i) => !String(i['SK']).includes('#')).sort((a, b) => Number(a['id']) - Number(b['id'])).map((i) => ({
    id: String(i['id']), admin_id: String(i['adminId']), acting_as: (i['actingAs'] as string | null | undefined) ?? null, area: String(i['area']), action: String(i['action']),
    target: String(i['target']), before: (i['before'] as Record<string, unknown> | null | undefined) ?? null,
    after: ((afters.has(Number(i['id'])) ? afters.get(Number(i['id'])) : i['after']) as Record<string, unknown> | null | undefined) ?? null,
    device: (i['device'] as string | null | undefined) ?? null,
  }));
}

/** test/admin-harness.ts `auditRows` on both backends (the jsonb type of before/after: 'object' or null). */
export async function auditRowsNeutral(t: TestDb): Promise<{ id: string; admin_id: string; acting_as: string | null; area: string; action: string; target: string; before_type: string | null; after_type: string | null }[]> {
  const kind = (v: unknown) => (v === null || v === undefined ? null : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : typeof v === 'string' ? 'string' : typeof v);
  return (await auditFull(t)).map(({ before, after, device: _d, ...r }) => ({ ...r, before_type: kind(before), after_type: kind(after) }));
}

/** The admins' listener ids. */
export async function adminIds(t: TestDb): Promise<string[]> {
  if (!t.store) return (await t.q<{ listener_id: string }>('SELECT listener_id FROM admins')).map((r) => r.listener_id);
  const { get } = await import('../src/db/ddb/store.ts');
  const it = await get(t.store, 'main', (await keys()).adminSet());
  return Object.keys((it?.['admins'] as Row | undefined) ?? {});
}

/** Every report as the old `reports` row (snake_case), oldest first. */
export async function reportRows(t: TestDb): Promise<Row[]> {
  if (!t.store) return t.q('SELECT * FROM reports ORDER BY created_at');
  return (await (await fx()).acScan(t.store, 'main', 'report')).map(asRow).sort((a, b) => (String(a['created_at']) < String(b['created_at']) ? -1 : 1));
}

/** Every moderation action (action, target_kind, target_id, actor_id), oldest first. */
export async function actionRows(t: TestDb): Promise<{ action: string; target_kind: string; target_id: string; actor_id: string }[]> {
  if (!t.store) return t.q('SELECT action, target_kind, target_id, actor_id FROM moderation_actions ORDER BY created_at');
  return (await (await fx()).acScan(t.store, 'main', 'moderationAction'))
    .sort((a, b) => (String(a['createdAt']) < String(b['createdAt']) ? -1 : 1))
    .map((a) => ({ action: String(a['action']), target_kind: String(a['targetKind']), target_id: String(a['targetId']), actor_id: String(a['actorId']) }));
}

/** Makes the reports on a target closed at `iso` (the purge test's "91 days ago"). */
export async function closeReportsAt(t: TestDb, targetId: string, iso: string, reason: string): Promise<void> {
  if (!t.store) { await t.q('UPDATE reports SET closed_at = $2, close_reason = $3 WHERE target_id = $1', [targetId, iso, reason]); return; }
  const { update } = await import('../src/db/ddb/store.ts');
  for (const r of await (await fx()).acScan(t.store, 'main', 'report')) {
    if (r['targetId'] !== targetId) continue;
    await update(t.store, 'main', { PK: String(r['PK']), SK: String(r['SK']) }, {
      update: 'SET #ca = :at, #cr = :why, G4PK = :q, G4SK = :qs', names: { '#ca': 'closedAt', '#cr': 'closeReason' },
      values: { ':at': iso, ':why': reason, ':q': 'Q#reports-closed', ':qs': `${iso}#${String(r['id'])}` },
    });
  }
}

/** A listener suspended now (as moderation would), with its sessions' copies. */
export async function suspendNow(t: TestDb, id: string): Promise<void> {
  if (!t.store) { await t.q('UPDATE listeners SET suspended_at = now() WHERE id = $1', [id]); return; }
  const { update } = await import('../src/db/ddb/store.ts');
  await update(t.store, 'main', (await keys()).listener(id), { update: 'SET #s = :s', names: { '#s': 'suspendedAt' }, values: { ':s': new Date().toISOString() } });
  const { refreshSessionCopies } = await import('../src/db/repos/account/ddb/common.ts');
  await refreshSessionCopies({ store: t.store, pg: t.db }, id);
}

/** How many act-as sessions exist. */
export async function actingSessionCount(t: TestDb): Promise<number> {
  if (!t.store) return (await t.q('SELECT 1 FROM sessions WHERE acting_admin_id IS NOT NULL')).length;
  return (await (await fx()).acSessions(t.store)).filter((s) => s['actingAdminId']).length;
}

/** Accounts made in Admin (email, bio, made_by), by creation then email. */
export async function madeListeners(t: TestDb): Promise<{ email: string; bio: string | null; made_by: string }[]> {
  if (!t.store) return t.q("SELECT email, bio, made_by FROM listeners WHERE made_by IS NOT NULL ORDER BY created_at, email");
  return (await (await fx()).acScan(t.store, 'main', 'listener')).filter((l) => l['madeBy'])
    .sort((a, b) => (String(a['createdAt']) < String(b['createdAt']) ? -1 : String(a['createdAt']) > String(b['createdAt']) ? 1 : String(a['email']) < String(b['email']) ? -1 : 1))
    .map((l) => ({ email: String(l['email']), bio: (l['bio'] as string | undefined) ?? null, made_by: String(l['madeBy']) }));
}

/** A listener's photo set by hand (the M24 photo-removal test's seed). */
export async function setAvatarRow(t: TestDb, id: string, url: string, path: string, bytes: number): Promise<void> {
  if (!t.store) { await t.q('UPDATE listeners SET avatar_url = $2, avatar_path = $3, avatar_bytes = $4 WHERE id = $1', [id, url, path, bytes]); return; }
  const { setAvatar } = await import('../src/db/repos/account/profile.ts');
  await setAvatar(t.db, id, { url, path, bytes });
}

/** A bare block row/items (no follow side effects — the old `INSERT INTO blocks`). */
export async function insertBlock(t: TestDb, blockerId: string, blockedId: string): Promise<void> {
  if (!t.store) { await t.q('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)', [blockerId, blockedId]); return; }
  const [{ encode }, K, { tx }] = await Promise.all([import('../src/db/ddb/codec.ts'), keys(), import('../src/db/ddb/tx.ts')]);
  const at = new Date().toISOString();
  await tx(t.store)
    .put('main', encode('block', K.block(blockerId, blockedId), { blockedId, createdAt: at }, { gsi: K.G4('blocks', at, `${blockerId}#${blockedId}`) }))
    .put('main', encode('blockedBy', K.blockedBy(blockedId, blockerId), { blockerId, createdAt: at }))
    .commit();
}

/** Hides shows as the old seed did (`INSERT INTO moderation_actions … 'hide_show'` + `INSERT INTO hidden_feeds`), through act() on both backends. */
export async function hideFeeds(t: TestDb, actorId: string, feedUrls: readonly string[]): Promise<void> {
  const { act } = await import('../src/db/repos/safety/moderation.ts');
  for (const u of feedUrls) await act(t.db, actorId, { kind: 'show', id: u }, 'hide_show');
}

/** Activity entries of a kind pointing at one comment or clip (lane SG's items on DynamoDB). */
export async function activityRefCount(t: TestDb, kind: string, refId: string): Promise<number> {
  if (!t.store) return (await t.q('SELECT 1 FROM activity WHERE kind = $1 AND ref_id = $2', [kind, refId])).length;
  return (await (await fx()).acScan(t.store, 'events', 'activity')).filter((a) => a['kind'] === kind && a['refId'] === refId).length;
}

/** Every block gone (the old `DELETE FROM blocks`). */
export async function deleteAllBlocks(t: TestDb): Promise<void> {
  if (!t.store) { await t.q('DELETE FROM blocks'); return; }
  const { del } = await import('../src/db/ddb/store.ts');
  for (const type of ['block', 'blockedBy']) {
    for (const i of await (await fx()).acScan(t.store, 'main', type)) await del(t.store, 'main', { PK: String(i['PK']), SK: String(i['SK']) });
  }
}

/** The listener's Studio sessions: CREATED `createdAgoMs` ago, last used now (G-A5). */
export async function ageStudioSessions(t: TestDb, listenerId: string, createdAgoMs: number): Promise<void> {
  const created = new Date(Date.now() - createdAgoMs).toISOString();
  if (!t.store) {
    await t.q("UPDATE sessions SET created_at = $2, last_seen_at = now() WHERE device_label = 'studio-web' AND listener_id = $1", [listenerId, created]);
    return;
  }
  const { update } = await import('../src/db/ddb/store.ts');
  for (const s of await (await fx()).acSessions(t.store, listenerId)) {
    if (s['deviceLabel'] !== 'studio-web' || s['actingAdminId']) continue;
    await update(t.store, 'main', { PK: String(s['PK']), SK: String(s['SK']) }, {
      update: 'SET #c = :c, #l = :l', names: { '#c': 'createdAt', '#l': 'lastSeenAt' }, values: { ':c': created, ':l': new Date().toISOString() },
    });
  }
}

/** Tries to change and to delete an audit record — G-A3 (SQL: the trigger refuses; DynamoDB: the Store refuses). */
export async function tamperWithAudit(t: TestDb): Promise<{ update: () => Promise<unknown>; remove: () => Promise<unknown> }> {
  if (!t.store) return { update: () => t.q("UPDATE admin_audit SET action = 'nothing happened'"), remove: () => t.q('DELETE FROM admin_audit') };
  const store = t.store;
  const { update, del } = await import('../src/db/ddb/store.ts');
  const [first] = await (await fx()).acScan(store, 'main', 'audit');
  const key = { PK: String(first?.['PK']), SK: String(first?.['SK']) };
  return {
    update: () => update(store, 'main', key, { update: 'SET #a = :a', names: { '#a': 'action' }, values: { ':a': 'nothing happened' } }),
    remove: () => del(store, 'main', key),
  };
}
