// The worker Lambda: drains the outbox (DynamoDB Stream batch or schedule) and runs the hourly job steps (schedule).
/**
 * M27 (specs/028-m27-aws-infra, contracts/lambda-events.md; replaces ci/workflows/recs.yml's loop).
 *
 * - A DynamoDB Stream batch (`Records[]`): run `drainOutbox`, answer `{ batchItemFailures }` for the records whose outbox
 *   entry is still there afterwards (a failed handler keeps its entry — outbox.ts), so the event source mapping retries
 *   them (`ReportBatchItemFailures`).
 * - `{ "kind": "drain" }` (every minute): `drainOutbox` — the safety net when a Stream record was lost or skipped.
 * - `{ "kind": "jobs" }` (hourly): the steps recs.yml ran, in the same order, by calling this app's own
 *   `POST /v1/internal/rebuild` in-process (no network, same token check) and following `next` until `done`.
 * Anything else is logged and ignored.
 */
import { createApp, type AppDeps } from './app.ts';
import { depsFromEnv } from './config.ts';
import { ATTACHED } from './db/backend.ts';
import './jobs/handlers.ts';
import { drainOutbox, pendingOutbox } from './jobs/outbox.ts';
import type { Store } from './db/ddb/store.ts';

/** `deletions` first (M32 A4): an account deletion is a promise to the listener; a slow `feeds` must never leave it for the next hour. */
export const JOB_STEPS = ['deletions', 'health', 'feeds', 'sweep', 'similarity', 'translate', 'digest'] as const;
/** At most this many chunks per step, as in recs.yml. */
export const MAX_CHUNKS = 200;
/** Stop starting new work when less than this is left (a chunk can take up to ~25 s). */
export const MIN_REMAINING_MS = 30_000;

type StreamRecord = { dynamodb?: { SequenceNumber?: string; NewImage?: { id?: { S?: string } } } };
type WorkerEvent = { Records?: StreamRecord[]; kind?: string };
type Context = { getRemainingTimeInMillis(): number };
export type WorkerResult = { batchItemFailures: { itemIdentifier: string }[] } | { ran: string[] } | undefined;

type Requester = { request(path: string, init: RequestInit): Response | Promise<Response> };

export function createWorker(deps: AppDeps, opts: { log?: (line: string) => void; jobToken?: string | undefined; app?: Requester } = {}) {
  const log = opts.log ?? ((line: string) => console.log(line));
  const attached = ATTACHED.get(deps.db);
  if (!attached) throw new Error('worker: the Db has no DynamoDB Store (DATA_BACKEND must be ddb)');
  const store: Store = attached.store;
  const app: Requester = opts.app ?? createApp(deps);
  const jobToken = (): string | undefined => opts.jobToken ?? deps.jobToken;

  /** `until`: the step starts no new chunk once less than this many ms remain (its share of the time left, M32 A4). */
  async function runStep(step: string, context: Context, until: number = MIN_REMAINING_MS, resume?: string): Promise<{ cursor: string } | undefined> {
    let cursor: string | undefined = resume;
    for (let n = 0; n < MAX_CHUNKS; n++) {
      const left = context.getRemainingTimeInMillis();
      if (left < MIN_REMAINING_MS) { log(`${step}: stopping, under ${MIN_REMAINING_MS / 1000} s left (the next hour resumes)`); return; }
      if (left < until) { log(`${step}: stopping, its share of the time is used`); return cursor ? { cursor } : undefined; }
      const res = await app.request('/v1/internal/rebuild', {
        method: 'POST',
        headers: { authorization: `Bearer ${jobToken() ?? ''}`, 'content-type': 'application/json' },
        body: JSON.stringify({ step, ...(cursor ? { cursor } : {}) }),
      });
      const out = (await res.json().catch(() => ({}))) as { done?: boolean; next?: string; counts?: unknown; ms?: number; error?: unknown };
      // The log is read by the owner and may be shared: only done, counts, ms and an error code — never the cursor (recs.yml, M25 S10).
      const code = res.ok ? undefined : (typeof out.error === 'string' ? out.error : (out.error as { code?: string } | undefined)?.code ?? `http_${res.status}`);
      log(`${step}: ${JSON.stringify({ done: out.done === true, ...(out.counts ? { counts: out.counts } : {}), ...(typeof out.ms === 'number' ? { ms: out.ms } : {}), ...(code ? { error: code } : {}) })}`);
      if (!res.ok) return;
      if (out.done === true) return;
      if (!out.next) { log(`${step}: no cursor and not done — stopping`); return; }
      cursor = out.next;
    }
    log(`${step}: did not finish in ${MAX_CHUNKS} chunks`);
  }

  return async (event: WorkerEvent, context: Context): Promise<WorkerResult> => {
    if (Array.isArray(event.Records)) {
      await drainOutbox(store);
      const left = new Set((await pendingOutbox(store)).map((it) => String(it['id'])));
      const batchItemFailures = event.Records
        .filter((r) => { const id = r.dynamodb?.NewImage?.id?.S; return id !== undefined && left.has(id); })
        .map((r) => ({ itemIdentifier: String(r.dynamodb?.SequenceNumber) }));
      log(`outbox batch: ${event.Records.length} records, ${batchItemFailures.length} failed`);
      return { batchItemFailures };
    }
    if (event.kind === 'drain') {
      const r = await drainOutbox(store, undefined, { limit: Math.max(50, Math.floor(context.getRemainingTimeInMillis() / 100)) });
      log(`outbox drain: done ${r.done}, failed ${r.failed}`);
      return undefined;
    }
    if (event.kind === 'jobs') {
      const ran: string[] = [];
      const unfinished: { step: string; cursor: string }[] = [];
      for (const [i, step] of JOB_STEPS.entries()) {
        const left = context.getRemainingTimeInMillis();
        if (left < MIN_REMAINING_MS) { log(`jobs: stopping before ${step}, under ${MIN_REMAINING_MS / 1000} s left`); break; }
        // Each step gets an equal share of what is left for it and the steps after it; unused time goes to the later steps.
        const until = Math.max(MIN_REMAINING_MS, left - Math.floor(left / (JOB_STEPS.length - i)));
        try { const more = await runStep(step, context, until); if (more) unfinished.push({ step, ...more }); } catch (e) { log(`${step}: error ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`); }
        ran.push(step);
      }
      // Second pass: time the other steps did not use goes back to the steps that stopped on their share, from where they stopped.
      for (const { step, cursor } of unfinished) {
        if (context.getRemainingTimeInMillis() < MIN_REMAINING_MS) break;
        try { await runStep(step, context, MIN_REMAINING_MS, cursor); } catch (e) { log(`${step}: error ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`); }
      }
      return { ran };
    }
    log(`worker: ignoring an event it does not know (keys: ${Object.keys(event ?? {}).join(',') || 'none'})`);
    return undefined;
  };
}

type Worker = ReturnType<typeof createWorker>;
/** The cold-start handler for a dependencies loader (`depsFromEnv` in production; a test passes its own). */
export const makeHandler = (load: () => Promise<AppDeps>) => {
  let ready: Promise<Worker> | undefined;
  return async (event: WorkerEvent, context: Context): Promise<WorkerResult> => {
    if (!ready) {
      // A failed read is not kept (M32 A3): the next event tries again instead of failing until the container is recycled.
      const p = load().then((deps) => createWorker(deps));
      p.catch(() => { if (ready === p) ready = undefined; });
      ready = p;
    }
    return (await ready)(event, context);
  };
};

export const handler = makeHandler(depsFromEnv);
