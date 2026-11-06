// 039 Q4: after the journey seed, the Discover hero has a moment to draw for listener-05 (the phone's listener in the device check).
/**
 * scripts/journey.ts seed runs against scripts/e2e-server.ts exactly as ci/workflows/ios-journey.yml runs them (DynamoDB Local,
 * DDB_ENDPOINT). Needs DynamoDB Local (scripts/ddb-local.sh); without DDB_ENDPOINT the test is skipped, as the other DynamoDB suites are in CI only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, openSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const freePort = (): Promise<number> => new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); s.on('error', rej); });

test('039 Q4: GET /v1/discover/moments for listener-05 returns a moment of "Episode 1" after the journey seed', { skip: process.env['DDB_ENDPOINT'] ? false : 'DDB_ENDPOINT not set' }, async () => {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const out = join(mkdtempSync(join(tmpdir(), 'journey-')), 'journey.json');
  const env = { ...process.env, PORT: String(port), E2E_HOST: '127.0.0.1', E2E_API: base, E2E_STORE_BASE: `${base}/__e2e/store/`, JOURNEY_OUT: out };
  const log = join(dirname(out), 'server.log');
  const fd = openSync(log, 'w');
  const server: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'scripts/e2e-server.ts'], { env, stdio: ['ignore', fd, fd] });
  try {
    for (let i = 0; i < 120 && !readFileSync(log, 'utf8').includes('e2e api on'); i++) await new Promise((r) => setTimeout(r, 500));
    assert.ok(readFileSync(log, 'utf8').includes('e2e api on'), `the e2e server did not start:\n${readFileSync(log, 'utf8')}`);
    const seed = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/journey.ts', 'seed'], { env, encoding: 'utf8', timeout: 240_000 });
    assert.equal(seed.status, 0, `seed failed:\n${seed.stdout}\n${seed.stderr}`);
    const j = JSON.parse(readFileSync(out, 'utf8')) as { episodes: { episodeId: string; title: string }[] };
    const sign = await fetch(`${base}/v1/auth/sign-in`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'listener-05@journey.test', password: 'e2e-correct-horse' }) });
    const { token } = (await sign.json()) as { token: string };
    const res = await fetch(`${base}/v1/discover/moments?limit=50`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { items: { episodeId: string; showTitle: string; reactions: number; startMs: number }[] };
    assert.ok(body.items.length >= 1, 'listener-05 gets at least one moment, so the Discover hero is drawn');
    const m = body.items[0]!;
    assert.equal(m.episodeId, j.episodes[0]!.episodeId, 'the moment is in Episode 1');
    assert.equal(m.showTitle, 'Journey Morning');
    assert.ok(m.reactions >= 5);
    assert.equal(m.reactions, 10, 'all ten reactions sit in one bucket');
    assert.ok(m.startMs <= 43_300 && 43_300 < m.startMs + 600, `the moment covers 43 s (starts ${m.startMs})`);
  } finally { server.kill('SIGTERM'); }
});
