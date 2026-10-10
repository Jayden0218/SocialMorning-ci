// Account deletion on DynamoDB: the 15-day wait, then a resumable job (JOB#delete) that removes the account piece by piece, listener item last.
/**
 * M26 lane AC (AC-T09; patterns AC-65…AC-77; data-model.md §8). A deletion cannot be one transaction any
 * more (a listener owns an unbounded number of items), so:
 *
 *   DELETE /v1/me ── TX: DELETION item (dueAt, G4 `Q#deletions`) + listener hiddenAt/deletingAt ──► sessions deleted
 *   Keep          ── TX: DELETION cancelled (G4 removed) + listener visible, only while no job exists
 *   hourly step   ── every due DELETION: TX start `JOB#delete#<id>` + take it off the queue ──► runJob
 *                    every open job (G4 `Q#jobs#delete`) is resumed first, so a crash half-way finishes later.
 *
 * The job's phases, each idempotent and saved after it runs (outbox.ts runJob):
 *   blobs      voice recordings, comment images (lane SC's code, still Postgres-indexed) and the photo;
 *   others     the lanes still on Postgres: their old one-transaction cascade (`deleteAccount` on Postgres —
 *              comments → placeholders under replies, reactions, clips, follows, heat …). Each lane replaces
 *              its part with a DynamoDB phase here when it moves; CUT deletes this phase;
 *   graph      lane SG's part (social/graph-ddb/deletion.ts): follows both ways with the other side's counters,
 *              activity, recent listens, notices to them, playlist pointers;
 *   paid       lane PD: the listener's purchases (with their order-id items, earnings, gifts and the entitlements a
 *              bought gift gave someone else) and the gifts they claimed lose their claimer — paid-ddb/purchases.ts
 *              `deletePaidStep`, 25 purchases a step; the rest of their money items are in `L#<id>` (partition);
 *   sessions   every session chain of the listener (pointers → items → predecessors);
 *   partition  everything else in `L#<id>` but the listener item (push tokens free their owner items);
 *   authored   items others keep that point at the listener (G1 `AUTH#<id>`: feedback, error reports) get
 *              `listenerId` cleared — the old ON DELETE SET NULL;
 *   unique     the U#EMAIL item (the email is free again) and the DELETION item;
 *   listener   the listener item, last.
 * Guard G-M26-AC2: a fault injected in the middle leaves the job open; the next run finishes it and no
 * listener item is left.
 * Finding 1 (moderation actions → listeners has no ON DELETE rule, so the deletion of a moderator FAILS on
 * Postgres) is kept as it is: the `others` phase still runs that cascade, so it fails and is retried exactly
 * as before — the owner's decision is still open (tasks.md AC-T09).
 */
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchWriteAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { TxCancelled } from '../../../ddb/tx.ts';
import { resumeJobs, runJob, startJob, type JobStep } from '../../../../jobs/outbox.ts';
import { DELETION_WAIT_DAYS, type DeletionStores } from '../deletion.ts';
import { deleteAccount as deleteAccountDual } from '../delete-account.ts';
import { removeAllFor } from '../../social/voice-posts.ts';
import { removeImagesFor } from '../../social/comment-images.ts';
import { adel, DAY_MS, getListener, iso, nowMs, partitionItems, plainPg, txa, unlessCondition, upd, type Hybrid, bridgeOn } from './common.ts';
import { shadowListener } from './foreign.ts';
import { deleteSessionChain } from './sessions.ts';
import { graphDeletionStep } from '../../social/graph-ddb/deletion.ts';

const DELETION = (id: string) => K.listenerSingleton(id, 'DELETION');
export const DELETE_JOB = 'delete';
const PHASES = ['blobs', 'others', 'graph', 'paid', 'sessions', 'partition', 'authored', 'unique', 'listener'] as const;
type Phase = (typeof PHASES)[number];
/** Items one job step handles at most (a step is one BatchWrite-sized chunk or one phase). */
const CHUNK = 25;

export async function requestDeletion(h: Hybrid, listenerId: string): Promise<{ dueAt: string }> {
  const now = nowMs(h);
  const dueAt = iso(now + DELETION_WAIT_DAYS * DAY_MS);
  await txa(h.store)
    .put('main', encode('deletion', DELETION(listenerId), { listenerId, requestedAt: iso(now), dueAt }, { gsi: K.G4('deletions', dueAt, listenerId) }))
    .update('main', K.listener(listenerId), { update: 'SET hiddenAt = :now, deletingAt = :due', condition: 'attribute_exists(PK)', values: { ':now': iso(now), ':due': dueAt } })
    .commit();
  if (bridgeOn(h)) await shadowListener(h.pg, listenerId, 'hidden_at', iso(now)); // shadow: every public read of the other lanes filters it
  // Signed out everywhere (not in the transaction: a listener's sessions are not bounded).
  for (const p of await partitionItems(h, K.L(listenerId), K.LISTENER_SK.sessions)) await deleteSessionChain(h, String(p['tokenHash']));
  return { dueAt };
}

export async function pendingDeletion(h: Hybrid, listenerId: string): Promise<{ dueAt: string } | null> {
  const d = await get(h.store, 'main', DELETION(listenerId));
  return d && !d['cancelledAt'] ? { dueAt: String(d['dueAt']) } : null;
}

/** Keep: only while the job has not started (after that the account is going, as the old single transaction was). */
export async function cancelDeletion(h: Hybrid, listenerId: string): Promise<boolean> {
  const now = iso(nowMs(h));
  let cancelled = true;
  try {
    await txa(h.store)
      .update('main', DELETION(listenerId), { update: 'SET cancelledAt = :now REMOVE G4PK, G4SK', condition: 'attribute_exists(PK) AND attribute_not_exists(cancelledAt)', values: { ':now': now } })
      .check('main', K.job(DELETE_JOB, listenerId), { condition: 'attribute_not_exists(PK)' })
      .commit();
  } catch (e) {
    if (!(e instanceof TxCancelled)) throw e;
    cancelled = false;
  }
  await unlessCondition(upd(h.store, 'main', K.listener(listenerId), { update: 'REMOVE hiddenAt, deletingAt', condition: 'attribute_exists(PK)' }));
  if (bridgeOn(h)) await shadowListener(h.pg, listenerId, 'hidden_at', null);
  return cancelled;
}

const keyOf = (i: Item) => ({ PK: String(i['PK']), SK: String(i['SK']) });

function deletionStep(h: Hybrid, stores: DeletionStores, listenerId: string): JobStep {
  return async (_store, job) => {
    const phase = (job.state['phase'] as Phase | undefined) ?? 'blobs';
    const next = (p: Phase): { state: Record<string, unknown>; done: boolean } => {
      const i = PHASES.indexOf(p);
      return { state: { ...job.state, phase: PHASES[i + 1] ?? 'done' }, done: i + 1 >= PHASES.length };
    };
    const stay = (extra: Record<string, unknown> = {}) => ({ state: { ...job.state, ...extra, phase }, done: false });
    switch (phase) {
      case 'blobs': {
        // M12 FR-104, M20 US9, M19 US1: the listener's stored files go before their rows (errors logged, as before).
        if (stores.voice) { try { await removeAllFor(h.pg, stores.voice, listenerId, stores.images); } catch (e) { console.error('voice cleanup on delete', e); } }
        if (stores.images) { try { await removeImagesFor(h.pg, stores.images, listenerId); } catch (e) { console.error('image cleanup on delete', e); } }
        if (stores.avatars) { try { const a = (await getListener(h, listenerId))?.avatarUrl; if (a) await stores.avatars.remove(a); } catch (e) { console.error('avatar cleanup on delete', e); } }
        return next('blobs');
      }
      case 'others': {
        const r = await deleteAccountDual(plainPg(h), listenerId); // the lanes still on Postgres, one transaction as before
        return { ...next('others'), state: { ...next('others').state, placeholders: r.placeholders, deleted: r.deleted, episodes: r.episodes } };
      }
      case 'graph': // lane SG (moved): follows both ways with the other side's counters, activity, notices — resumable chunks
        return (await graphDeletionStep(h, listenerId)) ? next('graph') : stay();
      case 'paid': {
        // Lane PD: the money cascades (listeners → purchases → entitlements/tips/gifts; gifts.claimed_by SET NULL).
        const { deletePaidStep } = await import('../paid-ddb/purchases.ts');
        return (await deletePaidStep(h.store, listenerId)) ? next('paid') : stay();
      }
      case 'sessions': {
        const ptrs = await partitionItems(h, K.L(listenerId), K.LISTENER_SK.sessions, CHUNK);
        if (ptrs.length === 0) return next('sessions');
        for (const p of ptrs) {
          await deleteSessionChain(h, String(p['tokenHash']));
          await batchWriteAll(h.store, 'main', [{ delete: keyOf(p) }]); // a pointer left by a chain that was already gone
        }
        return stay();
      }
      case 'partition': {
        const items = (await partitionItems(h, K.L(listenerId), undefined, CHUNK + 1)).filter((i) => i['SK'] !== 'PROFILE').slice(0, CHUNK);
        if (items.length === 0) return next('partition');
        for (const i of items) {
          const sk = String(i['SK']);
          if (sk.startsWith(K.LISTENER_SK.pushTokens)) {
            await unlessCondition(adel(h.store, 'main', K.pushTokenOwner(String(i['token'])), { condition: 'owner = :me', values: { ':me': listenerId } }));
          }
          if (sk.startsWith(K.AC_SK.actAs)) await deleteSessionChain(h, String(i['tokenHash']));
        }
        await batchWriteAll(h.store, 'main', items.map((i) => ({ delete: keyOf(i) })));
        return stay();
      }
      case 'authored': {
        const { items } = await queryAll(h.store, 'main', { IndexName: K.INDEX.G1, KeyConditionExpression: 'G1PK = :a', ExpressionAttributeValues: { ':a': `AUTH#${listenerId}` } }, { max: CHUNK });
        let changed = 0;
        for (const i of items) {
          // Only the account lane's own authored items: feedback and error reports keep their text, lose the sender.
          const out = await unlessCondition(upd(h.store, 'main', keyOf(i), {
            update: 'SET listenerId = :null REMOVE G1PK, G1SK', condition: 'listenerId = :me', values: { ':null': null, ':me': listenerId }, returnValues: 'UPDATED_NEW',
          }));
          if (out) changed++;
        }
        return changed > 0 ? stay() : next('authored');
      }
      case 'unique': {
        const l = await getListener(h, listenerId);
        // The email is free again — unless a new account already took it (then it is theirs and stays).
        if (l) await unlessCondition(adel(h.store, 'main', K.U.email(l.email), { condition: 'owner = :me', values: { ':me': listenerId } }));
        await adel(h.store, 'main', DELETION(listenerId));
        return next('unique');
      }
      case 'listener':
      default:
        await batchWriteAll(h.store, 'main', [{ delete: K.listener(listenerId) }]);
        return { state: { ...job.state, phase: 'done' }, done: true };
    }
  };
}

/** Starts (if needed) and runs the job to the end. Throws what a phase threw; the job stays open for the next run. */
export async function runDeletionJob(h: Hybrid, stores: DeletionStores, listenerId: string, opts: { maxSteps?: number } = {}): Promise<boolean> {
  const existing = await get(h.store, 'main', K.job(DELETE_JOB, listenerId));
  if (!existing) {
    try {
      await (startJob(txa(h.store).raw, h.store, DELETE_JOB, listenerId, { phase: 'blobs' })).commit();
    } catch (e) { if (!(e instanceof TxCancelled)) throw e; }
  }
  return runJob(h.store, DELETE_JOB, listenerId, deletionStep(h, stores, listenerId), { maxSteps: opts.maxSteps ?? 1000 });
}

/** The pre-M22 immediate deletion (blobs first, then everything) — now the job, run to the end. */
export async function finishDeletion(h: Hybrid, stores: DeletionStores, listenerId: string): Promise<void> {
  await runDeletionJob(h, stores, listenerId);
}

/** Used only by the job's `others` phase on Postgres; on DynamoDB the whole deletion is the job. */
export async function deleteAccount(h: Hybrid, listenerId: string): Promise<{ placeholders: number; deleted: number; episodes: string[] }> {
  await runDeletionJob(h, {}, listenerId);
  const j = await get(h.store, 'main', K.job(DELETE_JOB, listenerId));
  const s = (j?.['state'] ?? {}) as { placeholders?: number; deleted?: number; episodes?: string[] };
  return { placeholders: s.placeholders ?? 0, deleted: s.deleted ?? 0, episodes: s.episodes ?? [] };
}

/** The hourly step: open jobs first (a crash half-way finishes), then every due, uncancelled request (bounded). */
export async function runDueDeletions(h: Hybrid, stores: DeletionStores, limit = 20): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  const resumeStep: JobStep = (store, job) => deletionStep(h, stores, job.id)(store, job);
  try { deleted += await resumeJobs(h.store, DELETE_JOB, resumeStep, { max: limit, maxSteps: 1000 }); } catch (e) { failed++; console.error('a deletion job failed again; retried next cycle', e instanceof Error ? e.message : String(e)); }
  const { items } = await queryAll(h.store, 'main', {
    IndexName: K.INDEX.G4, KeyConditionExpression: 'G4PK = :q AND G4SK <= :now', ExpressionAttributeValues: { ':q': 'Q#deletions', ':now': `${iso(nowMs(h))}#~` },
  }, { max: Math.max(1, Math.floor(limit)) });
  for (const d of items) {
    const id = String(d['listenerId']);
    try {
      // Take it off the queue and start the job together; a request cancelled meanwhile is skipped.
      const t = txa(h.store).update('main', DELETION(id), { update: 'REMOVE G4PK, G4SK', condition: 'attribute_exists(PK) AND attribute_not_exists(cancelledAt) AND dueAt <= :now', values: { ':now': iso(nowMs(h)) } });
      startJob(t.raw, h.store, DELETE_JOB, id, { phase: 'blobs' });
      try { await t.commit(); } catch (e) { if (e instanceof TxCancelled) continue; throw e; }
      if (await runDeletionJob(h, stores, id)) deleted++;
    } catch (e) {
      failed++;
      console.error('due deletion failed; retried next cycle', e instanceof Error ? e.message : String(e));
    }
  }
  return { deleted, failed };
}

/** For the guard and the export: is anything of the listener left in its partition? */
export async function listenerItemsLeft(store: Store, listenerId: string): Promise<number> {
  return (await queryAll(store, 'main', { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': K.L(listenerId) }, ConsistentRead: true })).items.length;
}
