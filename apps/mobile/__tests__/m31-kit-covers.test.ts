// Checks that the kit says which review parts PanelRow and PulseButton stand in for.
/**
 * M31 T102 (converge round 1, G18 / review D6): the review asked for a `RowButton` and a `TextAction`.
 * The kit already has them under other names, so no new parts: `PanelRow` IS the RowButton and
 * `PulseButton` (kind `quiet` / `ring`) IS the TextAction cover. This keeps that said in the first line
 * of each file and in the `src/README.md` row, so nobody adds a third part for the same job.
 *
 * Break it to see it red: reword either top line (the file-map test also fails until the README row matches).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MOBILE = join(__dirname, '..');
const top = (f: string): string => readFileSync(join(MOBILE, f), 'utf8').split('\n')[0]!;
const row = (f: string): string => readFileSync(join(MOBILE, 'src/README.md'), 'utf8').split('\n').find((l) => l.startsWith(`| \`${f}\``))!;

it('G-M31-T102: PanelRow is the RowButton and PulseButton (quiet / ring) is the TextAction cover', () => {
  expect(top('src/ui/kit/PanelRow.tsx')).toContain('RowButton');
  expect(row('PanelRow.tsx')).toContain('RowButton');
  expect(top('src/ui/kit/PulseButton.tsx')).toContain('TextAction');
  expect(row('PulseButton.tsx')).toContain('TextAction');
  expect(top('src/ui/kit/PulseButton.tsx')).toMatch(/quiet/);
});
