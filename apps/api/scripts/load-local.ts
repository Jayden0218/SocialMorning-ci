// Load-tests the API on this machine only (localhost, DynamoDB Local) and writes a report; refuses any other host first.
/**
 * M28 US7 (research R12, contracts/gates.md "Local load run"; guard G-M28-LOCAL). A CODE-level load run: it finds where the
 * handlers and the data layer slow down on this machine. It says nothing about AWS (cold starts, Lambda concurrency, DynamoDB
 * latency are NOT measured) and the report says so.
 *
 *   cd apps/api && DDB_ENDPOINT=http://localhost:8000 npx tsx scripts/load-local.ts [options]
 *
 *   --url <http://localhost:PORT>  use a server already running here instead of starting one. Host must be localhost, 127.0.0.1
 *                                  or ::1 — anything else exits 2 BEFORE any request or connection. Needs LOAD_TOKENS (comma
 *                                  separated session tokens) and LOAD_EPISODES (comma separated episode ids); no reads/writes
 *                                  counts are available in this mode.
 *   --check                        only run the host check, then exit 0 (the guard uses it)
 *   --prefix <name>                DynamoDB table prefix for the run (default m28load<random>); the three tables are dropped at the end
 *   --peak-minutes <n>             length of the 20x-peak phase (profile: 15)
 *   --step-seconds <n>             length of each step of the step test (profile: 60)
 *   --steps <1,5,20,50>            connection counts of the step test
 *   --listeners <n>                accounts made for the run (profile: 600)
 *   --out <file>                   report path (default specs/029-m28-enterprise-hardening/load/<date>.md)
 *
 * Without --url the script starts its own API (a child of this process, `--serve`) on a random port with the demo seed
 * (scripts/seed-demo.ts) and wraps the Store's `send` there to count DynamoDB reads and writes per request group.
 * Full run time: about 20 minutes (setup ~1 min + peak 15 min + 4 x 60 s).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
export const SANDBOX_LINE = 'sandbox, DynamoDB Local — not AWS; cold starts, concurrency and DynamoDB latency NOT VERIFIED';

type Route = { group: string; kind: 'read' | 'write'; weight: number; method: string; path: string; what: string };
type Profile = {
  peak: { requestsPerHour: number; multiplier: number; minutes: number };
  steps: { connections: number[]; seconds: number };
  targets: { readP95Ms: number; writeP95Ms: number };
  listeners: number;
  routes: Route[];
};
export const loadProfile = (): Profile => JSON.parse(readFileSync(join(HERE, 'load-profile.json'), 'utf8')) as Profile;

/** G-M28-LOCAL: the only hosts a load run may aim at. `new URL` decides the host, so `localhost@evil.com` and `localhost.evil.com` fail. */
export function checkTarget(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, reason: `${raw} is not a URL` }; }
  if (url.protocol !== 'http:') return { ok: false, reason: `${url.protocol} — only plain http to this machine is allowed` };
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)) return { ok: false, reason: `host ${url.hostname} is not localhost, 127.0.0.1 or ::1` };
  return { ok: true, url };
}

const args = (argv: readonly string[]): Record<string, string | true> => {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { out[a.slice(2)] = next; i++; } else out[a.slice(2)] = true;
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------------------------
// The server side (child process): the API on a unique-prefix table set, with the demo seed and DynamoDB call counters.

type Counts = { requests: number; reads: number; writes: number; writeItems: number };
const READS = new Set(['GetCommand', 'QueryCommand', 'BatchGetCommand', 'ScanCommand']);

async function serve(a: Record<string, string | true>): Promise<void> {
  if (!process.env['DDB_ENDPOINT']) throw new Error('load: DDB_ENDPOINT is not set (DynamoDB Local, e.g. http://localhost:8000)');
  const [{ serve: honoServe }, { createApp }, { createDdbClients }, { createStore, prefixedTables, wrapStore }, { createTableSet, deleteTableSet }, { withStore }, { createSession }, { createListener }, { acceptRules }, { hashPassword }, { newestOfShows }, seed, { drainOutbox }] = await Promise.all([
    import('@hono/node-server'), import('../src/app.ts'), import('../src/db/ddb/client.ts'), import('../src/db/ddb/store.ts'), import('../src/db/ddb/schema.ts'),
    import('../src/db/backend-ddb.ts'), import('../src/auth/session.ts'), import('../src/db/repos/account/listeners.ts'), import('../src/db/repos/account/profile.ts'),
    import('../src/auth/password.ts'), import('../src/db/repos/discover/foryou.ts'), import('./seed-demo.ts'), import('../src/jobs/outbox.ts'),
  ]);
  const prefix = String(a['prefix']);
  const clients = createDdbClients();
  const tables = prefixedTables(prefix);
  await createTableSet(clients.raw, tables);
  // One drop however many signals arrive (stdin closing and SIGTERM both come at the end): a second caller waits for the first.
  let dropping: Promise<void> | undefined;
  const drop = (): Promise<void> => (dropping ??= deleteTableSet(clients.raw, tables).catch(() => undefined).then(() => clients.raw.destroy()));

  try {
    // The seed writes in the past (it moves the clock); after it the clock is the real one again.
    let pinned: number | undefined;
    const base = createStore({ clients, tables, secret: 'load-cursor-secret', clock: { now: () => pinned ?? Date.now() } });
    const als = new AsyncLocalStorage<string>();
    const stats = new Map<string, Counts>();
    let counting = false;
    const bucket = (g: string): Counts => { let c = stats.get(g); if (!c) { c = { requests: 0, reads: 0, writes: 0, writeItems: 0 }; stats.set(g, c); } return c; };
    const store = wrapStore(base, (command, next) => {
      if (counting) {
        const c = bucket(als.getStore() ?? 'background');
        const name = command.constructor.name;
        if (READS.has(name)) c.reads++;
        else {
          c.writes++;
          const input = command.input as { TransactItems?: unknown[]; RequestItems?: Record<string, unknown[]> };
          c.writeItems += input.TransactItems?.length ?? (Object.values(input.RequestItems ?? {}).reduce((n, v) => n + v.length, 0) || 1);
        }
      }
      return next(command);
    });
    const db = withStore(undefined, store);
    const timer = setInterval(() => { void drainOutbox(store).catch(() => undefined); }, 200); // the worker's job in production
    timer.unref();

    const demoPassword = 'load-demo-password';
    const { id } = await seed.seedDemo(db, { password: demoPassword, setClock: (ms) => { pinned = ms; } });
    pinned = undefined;
    const demoIds = Object.values(id) as string[];

    const pepper = 'load-pepper';
    const hash = await hashPassword('load-listener-password'); // one hash for every account: this is not a login test
    const poolSize = Number(a['listeners']);
    const pool: string[] = [];
    for (let i = 0; i < poolSize; i++) {
      const made = await createListener(db, `load+${i}@load.test`, hash, `Load ${i}`);
      if (made === 'exists') throw new Error('load: a load account already exists in a fresh table set');
      await acceptRules(db, made.id);
      pool.push(await createSession(db, made.id, pepper));
    }
    const demoTokens: string[] = [];
    for (const d of demoIds) demoTokens.push(await createSession(db, d, pepper));

    const app = createApp({
      db, pepper, publicBase: 'http://localhost/api',
      catalogFetch: (async () => { throw new Error('catalogue down in the load run'); }) as unknown as typeof fetch,
      pushFetch: (async () => new Response(JSON.stringify({ data: [] }))) as unknown as typeof fetch,
    });

    // Episodes the seed registered: every one with a length (positions need known episodes; the poll needs a duration for the heat curve).
    const subs = (await (await app.request('/v1/me/subscriptions', { headers: { authorization: `Bearer ${demoTokens[0]}` } })).json()) as { items: { feedUrl: string }[] };
    const episodes = (await newestOfShows(db, [...new Set(subs.items.map((s) => s.feedUrl))], 200)).filter((r) => r.duration_ms !== null).map((r) => ({ id: r.id, durationMs: Number(r.duration_ms) }));
    if (episodes.length === 0) throw new Error('load: the demo seed registered no episode with a length');

    counting = true;
    const server = honoServe({
      fetch: (req, env) => {
        const url = new URL(req.url);
        if (url.pathname === '/__load/info') return Response.json({ pool, demoTokens, episodes });
        if (url.pathname === '/__load/stats') {
          const out = Object.fromEntries(stats);
          stats.clear();
          return Response.json(out);
        }
        const group = req.headers.get('x-load-group') ?? 'other';
        bucket(group).requests++;
        return als.run(group, () => app.fetch(req, env));
      },
      port: 0, hostname: '127.0.0.1',
    }, (info) => console.log(`LOAD_READY ${info.port}`));

    const stop = async () => { clearInterval(timer); server.close(); await drop(); process.exit(0); };
    for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => { void stop(); });
    process.stdin.on('end', () => { void stop(); }); // the parent went away
    process.stdin.resume();
  } catch (e) {
    await drop();
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The driver (parent process).

type Sample = { group: string; kind: 'read' | 'write'; ms: number; status: number };
type PhaseResult = { name: string; connections: number; seconds: number; samples: Sample[]; errors: number; timeouts: number; counts: Record<string, Counts> | undefined };

export function percentile(sortedMs: readonly number[], p: number): number {
  if (sortedMs.length === 0) return NaN;
  return sortedMs[Math.min(sortedMs.length - 1, Math.max(0, Math.ceil((p / 100) * sortedMs.length) - 1))]!;
}

const fmt = (n: number): string => (Number.isNaN(n) ? '–' : n < 10 ? n.toFixed(1) : String(Math.round(n)));

type Info = { pool: string[]; demoTokens: string[]; episodes: { id: string; durationMs: number }[] };

function weighted(routes: readonly Route[]): () => Route {
  const total = routes.reduce((n, r) => n + r.weight, 0);
  return () => {
    let x = Math.random() * total;
    for (const r of routes) { x -= r.weight; if (x < 0) return r; }
    return routes[routes.length - 1]!;
  };
}

// Shared by every phase, so a listener does not comment again inside the server's 5 s floor when a new phase begins.
const turn = { comment: Math.floor(Math.random() * 1000), seq: 1 };

async function phase(
  autocannon: (o: object, cb: (e: Error | null, r: { errors: number; timeouts: number }) => void) => unknown,
  base: string, name: string, info: Info, routes: readonly Route[], opts: { connections: number; seconds: number; overallRate?: number },
  fetchStats: (() => Promise<Record<string, Counts>>) | undefined,
): Promise<PhaseResult> {
  const pick = weighted(routes);
  const samples: Sample[] = [];
  const rnd = (n: number) => Math.floor(Math.random() * n);
  const ep = () => info.episodes[rnd(info.episodes.length)]!;
  if (fetchStats) await fetchStats(); // reset the counters
  const result = await new Promise<{ errors: number; timeouts: number }>((res, rej) => {
    autocannon({
      url: base, connections: opts.connections, duration: opts.seconds, timeout: 10, ...(opts.overallRate ? { overallRate: opts.overallRate } : {}),
      requests: [{
        setupRequest: (req: { method: string; path: string; headers: Record<string, string>; body?: string }, ctx: { route?: Route; t0?: number }) => {
          const r = pick();
          ctx.route = r;
          ctx.t0 = performance.now();
          const e = ep();
          req.method = r.method;
          req.headers = { 'x-load-group': r.group };
          if (r.group === 'positions-sync') {
            req.path = r.path;
            req.headers['authorization'] = `Bearer ${info.pool[rnd(info.pool.length)]}`;
            req.headers['content-type'] = 'application/json';
            req.body = JSON.stringify({ deviceId: 'load-device', observations: [{ episodeId: e.id, offsetMs: rnd(e.durationMs), finished: false, progressSeq: turn.seq++, explicitSeek: false }] });
          } else if (r.group === 'comments-heat') {
            req.path = r.path.replace(':episode', e.id);
            req.headers['authorization'] = `Bearer ${info.pool[rnd(info.pool.length)]}`;
          } else if (r.group === 'feed') {
            req.path = r.path;
            req.headers['authorization'] = `Bearer ${info.demoTokens[rnd(info.demoTokens.length)]}`;
          } else if (r.group === 'discover') {
            req.path = r.path;
            req.headers['authorization'] = `Bearer ${info.pool[rnd(info.pool.length)]}`;
          } else {
            // A comment: accounts take turns so none posts twice inside the server's 5 s floor (a limit under test elsewhere).
            req.path = r.path.replace(':episode', e.id);
            req.headers['authorization'] = `Bearer ${info.pool[turn.comment++ % info.pool.length]}`;
            req.headers['content-type'] = 'application/json';
            req.body = JSON.stringify({ body: `load comment ${turn.comment} ${rnd(1e9)}`, offsetMs: rnd(e.durationMs) });
          }
          return req;
        },
        onResponse: (status: number, _body: string, ctx: { route?: Route; t0?: number }) => {
          if (ctx.route && ctx.t0 !== undefined) samples.push({ group: ctx.route.group, kind: ctx.route.kind, ms: performance.now() - ctx.t0, status });
        },
      }],
    }, (e, r) => (e ? rej(e) : res(r)));
  });
  return { name, connections: opts.connections, seconds: opts.seconds, samples, errors: result.errors, timeouts: result.timeouts, counts: fetchStats ? await fetchStats() : undefined };
}

type Row = { group: string; kind: 'read' | 'write'; n: number; p50: number; p95: number; p99: number; errPct: number; statuses: string; reads?: number; writes?: number };

export function summarise(p: PhaseResult): Row[] {
  const groups = [...new Set(p.samples.map((s) => s.group))].sort();
  return groups.map((g) => {
    const s = p.samples.filter((x) => x.group === g);
    const ms = s.map((x) => x.ms).sort((a, b) => a - b);
    const bad = s.filter((x) => x.status >= 400).length;
    const st: Record<number, number> = {};
    for (const x of s) st[x.status] = (st[x.status] ?? 0) + 1;
    const c = p.counts?.[g];
    return {
      group: g, kind: s[0]!.kind, n: s.length, p50: percentile(ms, 50), p95: percentile(ms, 95), p99: percentile(ms, 99), errPct: (100 * bad) / s.length,
      statuses: Object.entries(st).map(([k, v]) => `${k}×${v}`).join(' '),
      ...(c && c.requests > 0 ? { reads: c.reads / c.requests, writes: c.writes / c.requests } : {}),
    };
  });
}

/** The first step of the step test where any group of `kind` has p95 over `limitMs`. */
export function firstCrossing(steps: PhaseResult[], kind: 'read' | 'write', limitMs: number): string {
  for (const p of steps) {
    const hit = summarise(p).find((r) => r.kind === kind && r.p95 > limitMs);
    if (hit) return `${p.connections} connection${p.connections === 1 ? '' : 's'} (${hit.group}, p95 ${fmt(hit.p95)} ms)`;
  }
  return 'not crossed up to the last step';
}

function table(rows: Row[], counted: boolean): string {
  const head = `| group | kind | requests | p50 ms | p95 ms | p99 ms | 4xx/5xx % | statuses |${counted ? ' DDB reads/req | DDB writes/req |' : ''}`;
  const sep = `|---|---|---:|---:|---:|---:|---:|---|${counted ? '---:|---:|' : ''}`;
  const lines = rows.map((r) => `| ${r.group} | ${r.kind} | ${r.n} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.p99)} | ${r.errPct.toFixed(1)} | ${r.statuses} |${counted ? ` ${r.reads === undefined ? '–' : r.reads.toFixed(1)} | ${r.writes === undefined ? '–' : r.writes.toFixed(1)} |` : ''}`);
  return [head, sep, ...lines].join('\n');
}

function report(profile: Profile, phases: PhaseResult[], steps: PhaseResult[], counted: boolean, meta: { date: string; prefix: string; listeners: number; mode: string }): string {
  const t = profile.targets;
  const out: string[] = [
    `# Load run ${meta.date}`,
    '',
    `> ${SANDBOX_LINE}`,
    '',
    `Mode: ${meta.mode}. Tables prefix \`${meta.prefix}\` (dropped at the end). ${meta.listeners} load accounts + the 7 demo accounts. Tool: autocannon 8.0.0 (client side, one thread); latencies are measured per request from the client (setupRequest to onResponse), p95 by nearest rank.`,
    `Targets (docs/runbooks/slo.md): reads p95 < ${t.readP95Ms} ms, writes p95 < ${t.writeP95Ms} ms.`,
    '',
    '## Result',
    '',
    `- First step where a read route's p95 > ${t.readP95Ms} ms: **${firstCrossing(steps, 'read', t.readP95Ms)}**`,
    `- First step where a write route's p95 > ${t.writeP95Ms} ms: **${firstCrossing(steps, 'write', t.writeP95Ms)}**`,
    '',
  ];
  for (const p of phases) {
    out.push(`## ${p.name} — ${p.connections} connection${p.connections === 1 ? '' : 's'}, ${p.seconds} s`, '', table(summarise(p), counted), '', `Connection errors: ${p.errors}, timeouts: ${p.timeouts}.`, '');
  }
  if (counted) {
    out.push('## How reads and writes are counted', '', 'The Store\'s `send` is wrapped in the server process; each DynamoDB command made while a request is being handled is counted against that request\'s group (an AsyncLocalStorage value set from the `x-load-group` header). A transaction counts as one write. Outbox drains run on a timer and are not attributed to a request.', '');
  } else {
    out.push('## Reads and writes per request', '', 'Not available: the server was started elsewhere (`--url`), so its Store could not be wrapped.', '');
  }
  if (serverLog.size > 0) {
    out.push('## Server log (stderr, grouped by first 160 characters)', '', ...[...serverLog].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, n]) => `- ${n} × \`${k.replace(/`/g, "'")}\``), '');
  }
  out.push('## What this run cannot say', '', `${SANDBOX_LINE}. The generator and the server share one machine, so the numbers are a floor for the code's cost, not a prediction for AWS.`, '');
  return out.join('\n');
}

const serverLog = new Map<string, number>();

function spawnServer(prefix: string, listeners: number): Promise<{ child: ChildProcess; base: string }> {
  return new Promise((res, rej) => {
    const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--serve', '--prefix', prefix, '--listeners', String(listeners)], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
    let buf = '';
    child.stderr!.on('data', (d: Buffer) => { for (const l of d.toString().split('\n').filter((l) => l.trim() !== '' && /^[^\s'}\]]/.test(l))) { const k = l.slice(0, 160); serverLog.set(k, (serverLog.get(k) ?? 0) + 1); } });
    child.stdout!.on('data', (d: Buffer) => {
      buf += d.toString();
      const m = /LOAD_READY (\d+)/.exec(buf);
      if (m) res({ child, base: `http://127.0.0.1:${m[1]}` });
    });
    child.once('exit', (code) => rej(new Error(`load: the server process exited (${code}) before it was ready`)));
  });
}

/** Returns the process exit code. `io` is for tests. */
export async function run(argv: readonly string[], io: { log: (s: string) => void; err: (s: string) => void } = { log: console.log, err: console.error }): Promise<number> {
  const a = args(argv);
  if (a['serve']) { await serve(a); return 0; }

  // 1. The host check — before anything else, so nothing is sent, started or created for a wrong host.
  const external = typeof a['url'] === 'string';
  const target = checkTarget(external ? String(a['url']) : 'http://127.0.0.1');
  if (!target.ok) { io.err(`load-local: refusing to run — ${target.reason}. This script only aims at this machine.`); return 2; }
  if (a['check']) { io.log('load-local: target accepted'); return 0; }

  const profile = loadProfile();
  const peakMinutes = Number(a['peak-minutes'] ?? profile.peak.minutes);
  const stepSeconds = Number(a['step-seconds'] ?? profile.steps.seconds);
  const stepConns = typeof a['steps'] === 'string' ? a['steps'].split(',').map(Number) : profile.steps.connections;
  const listeners = Number(a['listeners'] ?? profile.listeners);
  const prefix = typeof a['prefix'] === 'string' ? a['prefix'] : `m28load${Math.random().toString(36).slice(2, 8)}`;
  const date = new Date().toISOString().slice(0, 10);
  const outFile = resolve(typeof a['out'] === 'string' ? a['out'] : join(REPO, 'specs', '029-m28-enterprise-hardening', 'load', `${date}.md`));
  const autocannon = createRequire(import.meta.url)('autocannon') as Parameters<typeof phase>[0];

  let child: ChildProcess | undefined;
  let base: string;
  let info: Info;
  let fetchStats: (() => Promise<Record<string, Counts>>) | undefined;
  if (external) {
    base = target.url.origin;
    const tokens = (process.env['LOAD_TOKENS'] ?? '').split(',').filter(Boolean);
    const eps = (process.env['LOAD_EPISODES'] ?? '').split(',').filter(Boolean);
    if (tokens.length === 0 || eps.length === 0) { io.err('load-local: --url needs LOAD_TOKENS and LOAD_EPISODES (comma separated)'); return 1; }
    info = { pool: tokens, demoTokens: tokens, episodes: eps.map((id) => ({ id, durationMs: 1_200_000 })) };
  } else {
    io.log(`load-local: starting the API on DynamoDB Local (${process.env['DDB_ENDPOINT'] ?? 'DDB_ENDPOINT unset'}), table prefix ${prefix}, ${listeners} accounts …`);
    const s = await spawnServer(prefix, listeners);
    child = s.child; base = s.base;
    info = (await (await fetch(`${base}/__load/info`)).json()) as Info;
    fetchStats = async () => (await (await fetch(`${base}/__load/stats`)).json()) as Record<string, Counts>;
  }

  const phases: PhaseResult[] = [];
  const steps: PhaseResult[] = [];
  try {
    const rate = Math.max(1, Math.ceil((profile.peak.requestsPerHour * profile.peak.multiplier) / 3600));
    io.log(`load-local: ${profile.peak.multiplier}x peak (${rate} request/s) for ${peakMinutes} min …`);
    phases.push(await phase(autocannon, base, `${profile.peak.multiplier}× peak`, info, profile.routes, { connections: 1, seconds: Math.round(peakMinutes * 60), overallRate: rate }, fetchStats));
    for (const c of stepConns) {
      io.log(`load-local: step test, ${c} connection${c === 1 ? '' : 's'} for ${stepSeconds} s …`);
      const p = await phase(autocannon, base, `Step ${c}`, info, profile.routes, { connections: c, seconds: stepSeconds }, fetchStats);
      phases.push(p); steps.push(p);
    }
  } finally {
    if (child) {
      const gone = new Promise<void>((r) => child!.once('exit', () => r()));
      child.stdin!.end(); // the server drops its tables when stdin closes
      child.kill('SIGTERM');
      await gone;
    }
  }
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, report(profile, phases, steps, !external, { date, prefix, listeners, mode: external ? `external server ${target.url.origin}` : 'own API process on DynamoDB Local with the demo seed' }));
  io.log(`load-local: report written to ${outFile}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run(process.argv.slice(2)).then((code) => { if (!args(process.argv.slice(2))['serve']) process.exit(code); }).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
