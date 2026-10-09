// The outbox: work a commit causes (fan-outs, rollups) queued in the same transaction, then drained idempotently; and resumable jobs.
/**
 * M26 F0-07, data-model.md §8–§9.
 *
 * - `enqueue(t, store, entry)` adds an `OUTBOX#<shard>/<createdAt>#<id>` item to the caller's TransactWriteItems,
 *   so the work exists if and only if the change committed.
 * - `drainOutbox(store, handlers)` runs each entry's handler oldest first per shard; on success deletes it, on
 *   failure keeps it with `attempts` + `lastError` (never dropped — Principle IV). An entry whose kind has no
 *   handler is kept too. Handlers MUST be idempotent: an entry can run twice (a crash between handler and
 *   delete); the `U.applied(id)` marker (keys.ts) is the usual way.
 *   Production: a DynamoDB Stream on sm-main filtered to OUTBOX# inserts calls this, plus a 1-minute schedule.
 *   Tests: the harness calls it after each request (research R9 — DynamoDB Local's Streams are not used).
 * - Jobs (`JOB#<kind>#<id>`): a saga for work over 100 items (account deletion, moved feed …). `startJob` is a
 *   TX item; `runJob` calls `step` repeatedly, saving `cursor`/`state` after each chunk with a version check
 *   (two workers never both advance one job); the sparse G4 queue `Q#jobs#<kind>` lists the open ones
 *   (`resumeJobs`), so an hourly step finishes anything a crash left half-done.
 *
 * This folder (src/jobs/) is also the only place a full-table Scan may appear (test/ddb-lint.test.ts).
 */
import { randomUUID, createHash } from 'node:crypto';
import { encode } from '../db/ddb/codec.ts';
import { G4, job as jobKey, outbox as outboxKey, OUTBOX_SHARDS } from '../db/ddb/keys.ts';
import { queryAll } from '../db/ddb/paginate.ts';
import { del, get, isoNow, update, type Item, type Key, type Store } from '../db/ddb/store.ts';
import type { Tx } from '../db/ddb/tx.ts';

export type OutboxEntry = { id: string; kind: string; payload: Record<string, unknown>; createdAt: string; attempts: number; key: Key };
export type OutboxHandler = (store: Store, entry: OutboxEntry) => Promise<void>;
export type Handlers = Readonly<Record<string, OutboxHandler>>;

const registry: Record<string, OutboxHandler> = {};
/** Registers the handler for an entry kind (domain lanes call this at module load). */
export function registerHandler(kind: string, handler: OutboxHandler): void {
  registry[kind] = handler;
}
export const registeredHandlers = (): Handlers => ({ ...registry });

const shardOf = (id: string): number => createHash('sha256').update(id).digest()[0]! % OUTBOX_SHARDS;

/** Adds an outbox entry to `t`. Returns its id. */
export function enqueue(t: Tx, store: Store, entry: { kind: string; payload?: Record<string, unknown>; id?: string }): string {
  const id = entry.id ?? randomUUID();
  const createdAt = isoNow(store.clock);
  t.put('main', encode('outbox', outboxKey(shardOf(id), createdAt, id), { kind: entry.kind, id, payload: entry.payload ?? {}, createdAt, attempts: 0 }), {
    condition: 'attribute_not_exists(PK)',
    label: `outbox:${entry.kind}`,
  });
  return id;
}

export type DrainResult = { done: number; failed: number; kept: string[] };

/** Runs every pending entry once (oldest first in each shard). */
export async function drainOutbox(store: Store, handlers: Handlers = registry, opts: { limit?: number } = {}): Promise<DrainResult> {
  const result: DrainResult = { done: 0, failed: 0, kept: [] };
  let budget = opts.limit ?? 1000;
  for (let shard = 0; shard < OUTBOX_SHARDS && budget > 0; shard++) {
    const { items } = await queryAll(store, 'main', {
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `OUTBOX#${shard}` },
      ConsistentRead: true,
    }, { max: budget });
    for (const it of items) {
      budget--;
      const entry: OutboxEntry = {
        id: String(it['id']), kind: String(it['kind']), payload: (it['payload'] ?? {}) as Record<string, unknown>,
        createdAt: String(it['createdAt']), attempts: Number(it['attempts'] ?? 0), key: { PK: String(it['PK']), SK: String(it['SK']) },
      };
      const handler = handlers[entry.kind];
      try {
        if (!handler) throw new Error(`no outbox handler for kind ${entry.kind}`);
        await handler(store, entry);
        await del(store, 'main', entry.key);
        result.done++;
      } catch (e) {
        result.failed++;
        result.kept.push(entry.id);
        await update(store, 'main', entry.key, {
          update: 'SET #a = if_not_exists(#a, :z) + :one, #e = :err, #w = :now',
          condition: 'attribute_exists(PK)',
          names: { '#a': 'attempts', '#e': 'lastError', '#w': 'lastTriedAt' },
          values: { ':z': 0, ':one': 1, ':err': String((e as Error)?.message ?? e).slice(0, 500), ':now': isoNow(store.clock) },
        }).catch(() => undefined);
      }
    }
  }
  return result;
}

/** Entries still waiting (for /mod errors and tests). */
export async function pendingOutbox(store: Store): Promise<Item[]> {
  const all: Item[] = [];
  for (let shard = 0; shard < OUTBOX_SHARDS; shard++) {
    const { items } = await queryAll(store, 'main', { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `OUTBOX#${shard}` }, ConsistentRead: true });
    all.push(...items);
  }
  return all;
}

// ---- jobs ----

export type JobState = Record<string, unknown>;
export type StepResult = { cursor?: string | null; state?: JobState; done: boolean };
export type JobStep = (store: Store, job: { id: string; cursor: string | null; state: JobState }) => Promise<StepResult>;

/** Adds the creation of a job to `t` (in the same TX as the user-visible change). */
export function startJob(t: Tx, store: Store, kind: string, id: string, state: JobState = {}): Tx {
  const now = isoNow(store.clock);
  return t.put('main', encode('job', jobKey(kind, id), { kind, id, state, cursor: null, v: 0, done: false, createdAt: now, updatedAt: now, runs: 0 }, { gsi: G4(`jobs#${kind}`, now, id) }), {
    condition: 'attribute_not_exists(PK)',
    label: `job:${kind}`,
  });
}

/**
 * Runs `step` until the job is done or `maxSteps` is reached. Each step's cursor/state is saved with
 * `v = :seen`; losing that race stops this run (another worker owns the job). Returns true when done.
 */
export async function runJob(store: Store, kind: string, id: string, step: JobStep, opts: { maxSteps?: number } = {}): Promise<boolean> {
  const key = jobKey(kind, id);
  for (let i = 0; i < (opts.maxSteps ?? 100); i++) {
    const it = await get(store, 'main', key, { consistent: true });
    if (!it) return true;
    if (it['done'] === true) return true;
    const v = Number(it['v'] ?? 0);
    let r: StepResult;
    try {
      r = await step(store, { id, cursor: (it['cursor'] as string | null) ?? null, state: (it['state'] ?? {}) as JobState });
    } catch (e) {
      await update(store, 'main', key, {
        update: 'SET #e = :e, #r = if_not_exists(#r, :z) + :one',
        names: { '#e': 'lastError', '#r': 'runs' },
        values: { ':z': 0, ':e': String((e as Error)?.message ?? e).slice(0, 500), ':one': 1 },
      }).catch(() => undefined);
      throw e;
    }
    try {
      await update(store, 'main', key, {
        update: r.done
          ? 'SET #c = :c, #s = :s, #v = :next, #d = :t, #u = :now, #r = if_not_exists(#r, :z) + :one REMOVE G4PK, G4SK'
          : 'SET #c = :c, #s = :s, #v = :next, #u = :now, #r = if_not_exists(#r, :z) + :one',
        condition: '#v = :seen',
        names: { '#c': 'cursor', '#s': 'state', '#v': 'v', '#u': 'updatedAt', '#r': 'runs', ...(r.done ? { '#d': 'done' } : {}) },
        values: {
          ':c': r.cursor ?? null, ':s': r.state ?? it['state'] ?? {}, ':next': v + 1, ':seen': v, ':now': isoNow(store.clock), ':one': 1, ':z': 0,
          ...(r.done ? { ':t': true } : {}),
        },
      });
    } catch (e) {
      if ((e as { name?: string })?.name === 'ConditionalCheckFailedException') return false;
      throw e;
    }
    if (r.done) return true;
  }
  return false;
}

/** Resumes every open job of `kind` (oldest first) through the G4 queue. Returns how many finished. */
export async function resumeJobs(store: Store, kind: string, step: JobStep, opts: { max?: number; maxSteps?: number } = {}): Promise<number> {
  const { items } = await queryAll(store, 'main', {
    IndexName: 'GSI4',
    KeyConditionExpression: 'G4PK = :q',
    ExpressionAttributeValues: { ':q': `Q#jobs#${kind}` },
  }, { max: opts.max ?? 50 });
  let finished = 0;
  for (const it of items) {
    const id = String(it['id'] ?? String(it['PK']).split('#').slice(2).join('#'));
    if (await runJob(store, kind, id, step, opts.maxSteps !== undefined ? { maxSteps: opts.maxSteps } : {})) finished++;
  }
  return finished;
}
