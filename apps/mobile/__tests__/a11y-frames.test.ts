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

// 035 (run 41362300402): iOS repeats a control's name on an inner node (a 40 pt disc inside the 48 pt Pressable). The guard judges the OUTERMOST node of a name only,
// so the inner repeat is not a finding; a control whose outer frame is small still is.
it('an inner node repeating its parent\'s name is not judged; the outer frame is', () => {
  const outer = (b: string) => node('Play Ep', b, [node('Play Ep', '[18,18][58,58]', [node('', '[28,28][48,48]', [], 'icon-play')])]);
  expect(run({ 'hierarchy/r1-end.json': screen(outer('[10,10][58,58]')) }).status).toBe(0); // outer 48 x 48
  const small = run({ 'hierarchy/r1-end.json': screen(outer('[18,18][58,58]')) }); // outer 40 x 40
  expect(small.status).toBe(1);
  expect(small.out).toContain('"Play Ep" is 40 x 40 pt');
});

// 036 T014 (US3). Tappables WITHOUT an icon. Maestro's hierarchy has no role or trait (read from the device-check artifact of run 41420682128: the only
// per-node fields are accessibilityText, value, text, resource-id, bounds, enabled, focused, selected, checked). The rule is therefore drawn from what the
// frames show (gate-log.md "T014 rule and findings"): a node is a tappable when it is `enabled` "true", has a label, is the outermost node of that label, and
// is NOT static text, which shows as (a) a child repeating its parent's label, (b) a label that is only part of a larger labelled group's label (the card
// reads "Listener 06, 47 min ago, ..."), (c) system chrome (status bar, scroll bars), (d) a turned section label (narrower than 20 pt and taller than wide).
const live = (label: string, bounds: string, children: unknown[] = []) => ({ attributes: { accessibilityText: label, 'resource-id': '', bounds, enabled: 'true' }, children });
describe('036 T014: labelled tappables without an icon', () => {
  it('a 45 pt tall text chip passes', () => {
    expect(run({ 'hierarchy/r1-end.json': screen(live('Newest', '[10,10][106,55]')) }).status).toBe(0); // 96 x 45
  });
  it('a 40 pt tall text chip fails, named with its size', () => {
    const r = run({ 'hierarchy/r1-end.json': screen(live('Newest', '[10,10][106,50]')) }); // 96 x 40
    expect(r.status).toBe(1);
    expect(r.out).toContain('"Newest" is 96 x 40 pt');
  });
  it('a narrow tappable such as "Reply" 35 x 44 fails on its width', () => {
    const r = run({ 'hierarchy/r1-end.json': screen(live('Reply', '[10,10][45,54]')) });
    expect(r.status).toBe(1);
    expect(r.out).toContain('"Reply" is 35 x 44 pt');
  });
  it('a plain text line (its label repeated by a child, as iOS draws static text) is not judged', () => {
    expect(run({ 'hierarchy/r1-end.json': screen(live("That's all", '[25,709][56,727]', [live("That's all", '[25,709][56,727]')])) }).status).toBe(0);
  });
  it('a label that is only part of a larger labelled group (the name inside a comment card) is not judged', () => {
    const r = run({ 'hierarchy/r1-end.json': screen(live('Listener 06, 47 min ago, Play from 0:36, Seed', '[86,483][358,537]'), live('Listener 06', '[118,485][195,505]')) });
    expect(r.status).toBe(0);
  });
  it('system chrome (scroll bars, status bar) and turned section labels are not judged', () => {
    expect(run({ 'hierarchy/r1-end.json': screen(live('Horizontal scroll bar, 1 page', '[13,777][376,807]'), live('100% battery power', '[346,18][371,30]'), live('Cellular', '[302,19][319,30]'), live('10:18 AM', '[32,15][72,34]'), live('Voice', '[6,59][20,106]'), live('Me', '[6,179][20,201]')) }).status).toBe(0);
  });
  it('036: a tappable cut by the top edge of the screen is not judged short (its frame runs off-screen)', () => {
    expect(run({ 'hierarchy/r1-end.json': screen(live('Play from 0:02', '[15,-34][67,9]')) }).status).toBe(0);
  });
  it('036: a tappable fully on screen and 43 pt tall still fails', () => {
    expect(run({ 'hierarchy/r1-end.json': screen(live('Play from 0:02', '[15,100][67,143]')) }).status).toBe(1);
  });
  it('a disabled labelled element is not a tappable', () => {
    const d = live('Newest', '[10,10][106,50]');
    (d.attributes as Record<string, string>).enabled = 'false';
    expect(run({ 'hierarchy/r1-end.json': screen(d) }).status).toBe(0);
  });
  it('an icon control still reports once (not twice) when it is also a labelled tappable', () => {
    const r = run({ 'hierarchy/r1-end.json': screen(node('More', '[10,10][53,53]', [node('', '[20,20][40,40]', [], 'icon-ellipsis')])) });
    expect(r.out.match(/"More"/g)?.length).toBe(1);
  });
});

// 036 D6 (owner, 2026-11-02): a dense dot row is not judged. The player ring draws up to 31 comment pins, 18 x 18 pt (`testID` "ring-pin", names "Comment at m:ss by ..."),
// 15-16 pt apart in the dense stretches: a 44 frame each would overlap its neighbours, and the same moments also open from the Comments button and the heat strip.
// DENSE, exactly: a node with a non-empty `resource-id` is a member of a dense row when another node on the SAME screen has the same `resource-id`, the same width and
// the same height, and its centre is less than 44 pt from this node's centre. A lone dot (no such neighbour) and a dot with no `resource-id` are judged as before.
describe('036 D6: a dense row of same-id, same-shape dots is not judged', () => {
  const dot = (label: string, x: number, y = 100, id = 'ring-pin') => ({ attributes: { accessibilityText: label, 'resource-id': id, bounds: `[${x},${y}][${x + 18},${y + 18}]`, enabled: 'true' }, children: [] });
  const row = (n: number, step: number, id = 'ring-pin') => Array.from({ length: n }, (_, i) => dot(`Comment at 0:${10 + i} by Ana`, 20 + i * step, 100, id));
  it('a row of 18 x 18 dots 16 pt apart (centres 16 apart, x step 16, labels all different) is not judged', () => {
    expect(run({ 'hierarchy/r1-end.json': screen(...row(6, 16)) }).status).toBe(0);
  });
  it('a lone 18 x 18 dot still fails, named with its size', () => {
    const r = run({ 'hierarchy/r1-end.json': screen(dot('Comment at 0:10 by Ana', 20)) });
    expect(r.status).toBe(1);
    expect(r.out).toContain('"Comment at 0:10 by Ana" is 18 x 18 pt');
  });
  it('dots whose centres are 44 pt or more apart are not dense: both fail', () => {
    const r = run({ 'hierarchy/r1-end.json': screen(dot('Comment at 0:10 by Ana', 20), dot('Comment at 0:20 by Bo', 64)) });
    expect(r.status).toBe(1);
    expect(r.out).toContain('2 control(s)');
  });
  it('a dense row with no resource-id (or two different ones) is judged', () => {
    expect(run({ 'hierarchy/r1-end.json': screen(...row(4, 16, '')) }).status).toBe(1);
    expect(run({ 'hierarchy/r1-end.json': screen(dot('Comment at 0:10 by Ana', 20, 100, 'a'), dot('Comment at 0:20 by Bo', 36, 100, 'b')) }).status).toBe(1);
  });
  it('a same-id neighbour of another shape does not make a dot dense', () => {
    const big = { attributes: { accessibilityText: 'Comment at 0:30 by Cy', 'resource-id': 'ring-pin', bounds: '[36,100][80,144]', enabled: 'true' }, children: [] };
    expect(run({ 'hierarchy/r1-end.json': screen(dot('Comment at 0:10 by Ana', 20), big) }).status).toBe(1);
  });
  it('the dots of one screen do not shield those of another', () => {
    const r = run({ 'hierarchy/r1-end.json': screen(dot('Comment at 0:10 by Ana', 20)), 'hierarchy/r2-end.json': screen(dot('Comment at 0:20 by Bo', 36)) });
    expect(r.status).toBe(1);
    expect(r.out).toContain('2 control(s)');
  });
});
