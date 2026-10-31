// Guard for the 'still has the function' blind spot: delete the bottom-bar action `Delete playlist`
// (an object in the `actions` array handed to the kit title bar) in a COPY of the real app and the
// replay must go red naming it. Reads only; the real tree is never touched.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

it('replay goes red when app/playlists/[id].tsx loses its Delete playlist action', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'm31-blind-'));
  try {
    for (const d of ['app', 'src']) cpSync(join(ROOT, d), join(tmp, d), { recursive: true, filter: (s) => !s.includes('node_modules') });
    const f = join(tmp, 'app', 'playlists', '[id].tsx');
    const src = readFileSync(f, 'utf8');
    const cut = src.replace(/^[ \t]*\{[^\n]*label: 'Delete playlist'[^\n]*\},?[ \t]*\n/m, '');
    expect(cut).not.toBe(src); // the object really was removed
    writeFileSync(f, cut);
    const inv = spawnSync(process.execPath, [join(ROOT, 'scripts', 'action-inventory.mjs'), '--root', tmp, '--commit', 'x'], { encoding: 'utf8', maxBuffer: 1 << 28 });
    expect(inv.status).toBe(0);
    const nowFile = join(tmp, 'now.json');
    writeFileSync(nowFile, inv.stdout);
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'action-replay.mjs'), '--now', nowFile], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
    expect(r.stdout).toMatch(/MISSING .*Delete playlist/);
    expect(r.status).toBe(1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
