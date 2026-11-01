// Tests the a11y audit's rule: no button inside an element marked `accessible`.
/**
 * 035 T060 (device check A1; FR-013; SC-003). On iOS an `accessible` element is one VoiceOver stop and hides what is inside it, so a
 * button inside it ("Change email" inside the email strip) cannot be reached. The audit (`scripts/a11y-audit.mjs`) must fail on it.
 * Each fixture is its own tiny app tree (`app/`), and the script runs with that folder as its working directory, as it does in the gate.
 * Seen red first: before the rule existed the "bad" fixture exited 0.
 * Breaks that turn it red: delete the nested-tappable check from the audit.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const SCRIPT = path.join(__dirname, '..', 'scripts', 'a11y-audit.mjs');
const run = (fixture: string) => spawnSync(process.execPath, [SCRIPT], { cwd: path.join(__dirname, 'fixtures', 'a11y-nested', fixture), encoding: 'utf8' });

it('a Pressable inside an accessible Box fails the audit and names the file and line', () => {
  const r = run('bad');
  expect(r.status).not.toBe(0);
  expect(r.stderr).toMatch(/Bad\.tsx:\d+/);
  expect(r.stderr).toMatch(/inside an element marked `accessible`/);
});

it('the same controls as siblings, or inside accessible={false}, pass', () => {
  const r = run('good');
  expect(r.stderr).toBe('');
  expect(r.status).toBe(0);
});
