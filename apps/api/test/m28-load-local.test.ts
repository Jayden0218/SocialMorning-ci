// G-M28-LOCAL: the load script refuses any host but this machine before it sends or connects to anything.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkTarget, run } from '../scripts/load-local.ts';

const SCRIPT = fileURLToPath(new URL('../scripts/load-local.ts', import.meta.url));
const API_DIR = fileURLToPath(new URL('..', import.meta.url));

/** Runs the script in this process with every way out watched: fetch and the socket connect. Returns the exit code and how many requests were attempted. */
async function attempt(argv: string[]): Promise<{ code: number; attempts: number; err: string[] }> {
  const fetchSpy = mock.method(globalThis, 'fetch', async () => new Response('{}'));
  const connectSpy = mock.method(net.Socket.prototype, 'connect', function (this: net.Socket) { return this; } as never);
  const err: string[] = [];
  try {
    const code = await run(argv, { log: () => undefined, err: (s) => err.push(s) });
    return { code, attempts: fetchSpy.mock.callCount() + connectSpy.mock.callCount(), err };
  } finally {
    fetchSpy.mock.restore();
    connectSpy.mock.restore();
  }
}

test('G-M28-LOCAL: a host that is not this machine exits 2 and nothing is sent', async () => {
  for (const url of ['https://example.com', 'http://example.com:8787', 'http://localhost.example.com', 'http://localhost@example.com', 'http://10.0.0.5:8787', 'https://localhost:8787', 'not a url']) {
    const r = await attempt(['--url', url, '--check']);
    assert.equal(r.code, 2, `${url} must exit 2`);
    assert.equal(r.attempts, 0, `${url}: no request or connection may be attempted`);
    assert.match(r.err.join('\n'), /refusing to run/);
  }
});

test('G-M28-LOCAL: localhost, 127.0.0.1 and ::1 are accepted (check only — nothing is sent)', async () => {
  for (const url of ['http://localhost:8787', 'http://127.0.0.1:8787', 'http://[::1]:8787']) {
    assert.equal(checkTarget(url).ok, true, url);
    const r = await attempt(['--url', url, '--check']);
    assert.equal(r.code, 0, `${url} accepted`);
    assert.equal(r.attempts, 0);
  }
});

test('G-M28-LOCAL: the real script, run as a process, exits 2 for example.com', () => {
  const r = spawnSync(process.execPath, ['--import', 'tsx', SCRIPT, '--url', 'https://example.com', '--check'], { cwd: API_DIR, encoding: 'utf8', timeout: 60_000 });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /refusing to run/);
});
