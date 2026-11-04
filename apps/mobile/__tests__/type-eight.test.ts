// The text styles are the eight of the design system, nothing else (038 US2, FR-003, SC-004).
/**
 * 038 M3: `typeScale` has `title`, `heading`, `number`, `strong`, `body`, `small`, `time`, `tag`, with the values of
 * `__tests__/fixtures/design-system-tokens.json` (a copy of specs/038-design-system/design-system/tokens.json; `cmp` at
 * close). Every other name is an alias of one of them, so at most 8 distinct (face, size, line, weight, tracking) sets exist.
 * `lineSafe` may exceed the drawn line (Android clips text to its line height, see FACE_LEADING), never fall short of it.
 * The break that turns it red: set `typeScale.body.size` to 16, or re-add a step with its own size.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { typeScale } from '@/design';
import { familyFor } from '@/design/fonts';

type Sys = { name: string; family: 'display' | 'ui' | 'mono'; fontSize: string; lineHeight: string; fontWeight: number; letterSpacing?: string };
const system: Sys[] = (JSON.parse(readFileSync(join(__dirname, 'fixtures/design-system-tokens.json'), 'utf8')) as { type: { groups: { styles: Sys[] }[] } })
  .type.groups.flatMap((g) => g.styles);
const NAMES = ['title', 'heading', 'number', 'strong', 'body', 'small', 'time', 'tag'] as const;
const WEIGHT: Record<string, number> = { Regular: 400, Medium: 500, SemiBold: 600, Bold: 700, ExtraBold: 800 };
const weightOf = (cls: string): number => WEIGHT[familyFor(cls).split('-')[1]!]!;
const px = (s: string | undefined): number => (s === undefined ? 0 : parseFloat(s));
const entries = Object.entries(typeScale) as [string, (typeof typeScale)[keyof typeof typeScale]][];

it('the design system has the eight styles', () => {
  expect(system.map((s) => s.name)).toEqual([...NAMES]);
});

it.each(NAMES)('typeScale.%s has the design system\'s face, size, line, weight and tracking', (name) => {
  const want = system.find((s) => s.name === name)!;
  const got = (typeScale as Record<string, (typeof entries)[number][1]>)[name];
  expect(got).toBeDefined();
  expect({ face: got!.face, size: got!.size, line: got!.line, weight: weightOf(got!.cls), tracking: got!.tracking }).toEqual({
    face: want.family, size: px(want.fontSize), line: px(want.lineHeight), weight: want.fontWeight, tracking: px(want.letterSpacing),
  });
  expect(got!.lineSafe).toBeGreaterThanOrEqual(got!.line);
});

it('every step, old names included, is one of the eight: at most 8 distinct sets', () => {
  const sets = new Set(entries.map(([, v]) => JSON.stringify([v.face, v.size, v.line, weightOf(v.cls), v.tracking])));
  const eight = new Set(NAMES.map((n) => { const v = (typeScale as Record<string, (typeof entries)[number][1]>)[n]!; return JSON.stringify([v.face, v.size, v.line, weightOf(v.cls), v.tracking]); }));
  expect([...sets].filter((s) => !eight.has(s))).toEqual([]);
  expect(sets.size).toBeLessThanOrEqual(8);
});

it('the CSS has a size and a line for each of the eight (global.css)', () => {
  const css = readFileSync(join(__dirname, '..', 'global.css'), 'utf8');
  for (const n of NAMES) {
    const t = (typeScale as Record<string, (typeof entries)[number][1]>)[n]!;
    expect(css).toContain(`--text-pulse-${n}: ${t.size}px`);
    expect(css).toContain(`--text-pulse-${n}--line-height: ${t.lineSafe}px`);
  }
});
