// Tests the device check's frame guard: a labelled icon control drawn under 44 x 44 pt fails it.
/**
 * 035 T062 (device check A3; SC-003). `.maestro/check/a11y-frames.mjs` reads the hierarchies Maestro wrote and fails on a labelled
 * element holding an `icon-*` child whose frame is under 44 x 44. Seen red on the artifact of run 41311287075 (it named "Stickers"
 * 104 x 36 and "Close" 36 x 36); here, on hand-made hierarchies: 43 x 43 fails, 44 x 44 passes, a 40 pt one with no icon in it is not
 * its business, and a directory with no hierarchy fails (a check that read nothing proved nothing).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SCRIPT = path.join(__dirname, '..', '.maestro', 'check', 'a11y-frames.mjs');
const node = (label: string, bounds: string, children: unknown[] = [], id = '') => ({ attributes: { accessibilityText: label, 'resource-id': id, bounds }, children });
const screen = (...kids: unknown[]) => node('', '[0,0][390,844]', kids);
function run(files: Record<string, unknown>): { status: number | null; out: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'frames-'));
  for (const [rel, tree] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), JSON.stringify(tree));
  }
  const r = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
}

it('a 43 x 43 labelled icon control fails, and is named with its size', () => {
  const r = run({ 'hierarchy/r1-end.json': screen(node('More', '[10,10][53,53]', [node('', '[20,20][40,40]', [], 'icon-ellipsis')])) });
  expect(r.status).toBe(1);
  expect(r.out).toContain('"More" is 43 x 43 pt');
});

it('44 x 44 passes', () => {
  expect(run({ 'hierarchy/r1-end.json': screen(node('More', '[10,10][54,54]', [node('', '[20,20][40,40]', [], 'icon-ellipsis')])) }).status).toBe(0);
});

it('a small labelled element with no icon inside (a text chip) is not this guard\'s business', () => {
  expect(run({ 'hierarchy/r1-end.json': screen(node('Hello', '[10,10][40,30]')) }).status).toBe(0);
});

it('the screens Maestro saves at a failing step are read too', () => {
  const r = run({ 'maestro/r2/d/r2/screen-hierarchy/step-1.json': screen(node('Close', '[10,10][46,46]', [node('', '[20,20][36,36]', [], 'icon-close')])) });
  expect(r.status).toBe(1);
  expect(r.out).toContain('"Close" is 36 x 36 pt');
});

it('no hierarchy file at all fails: a check that read nothing proved nothing', () => {
  const r = run({ 'summary.tsv': 'x' });
  expect(r.status).toBe(1);
});
