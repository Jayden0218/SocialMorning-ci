// Checks the Pulse tokens: palette, type scale, spacing, bars maths, fonts, and the wave rules of the token check.
/**
 * M31 T021 guards. Break each one to see it fail:
 *  - G-P1 palette: change `void` in src/design/tokens.ts (the drawings' #060608);
 *  - G-P2 type scale: change a size in `fontSize['pulse-row']` without `typeScale.row.size`;
 *  - G-P3 bars: change `bars.nowGap` (the drawings' 8) — the 92 / 100 / 166 / 176 sums go red;
 *  - G-P4 wave rules: add `className="p-3 text-[15px]"` to a wave file and run `node scripts/token-check.mjs`
 *    (the evidence is in the gate log: seen red, then restored).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FACE_LEADING } from '@/design/tokens';
import { bars, bottomInset, colour, fontSize, gutter, lineHeight, motion, nowBarBottom, radius, spacing, titleBarBottom, toastBottom, typeScale, typeStyle } from '@/design';

const MOBILE = join(__dirname, '..');

it('G-P1: the palette is the drawings\' (kit.css :root)', () => {
  expect({ void: colour.void, raise: colour.raise, raise2: colour.raise2, line: colour.line, text: colour.text, text2: colour.text2, text3: colour.text3, idle: colour.idle, hot: colour.hot, hotText: colour.hotText, violet: colour.violet, ok: colour.ok, warn: colour.warn }).toEqual({
    void: '#060608', raise: '#111116', raise2: '#1a1a21', line: '#24242c', text: '#f4f2ee', text2: '#a3a1ab', text3: '#8a8893', idle: '#77767e', hot: '#ff4d6d', hotText: '#ff8095', violet: '#7a3cff', ok: '#3ddc97', warn: '#ffb547',
  });
});

it('there is no light palette left: the page is near-black and the old paper colours are gone', () => {
  const src = readFileSync(join(MOBILE, 'src', 'design', 'tokens.ts'), 'utf8');
  for (const gone of ['#fbf8f1', '#ffffff', '#fcc522', '#16130d']) expect(src.toLowerCase()).not.toContain(gone);
  expect(colour.background).toBe(colour.void);
});

it('G-P2: every Pulse type step has a size, a line height and a class, and the scale is the one drawn', () => {
  const drawn = { hero: [30, 31], title: [22, 26], heading: [20, 23], section: [17, 22], row: [15, 20], body: [15, 22], compact: [14, 18], note: [14, 20], lede: [18, 22], statement: [24, 29], caption: [13, 18], mono: [12, 22], badge: [10, 16] } as const;
  for (const [name, [size, line]] of Object.entries(drawn)) {
    const step = typeScale[name as keyof typeof typeScale];
    expect([name, step.size, step.line]).toEqual([name, size, line]);
    const key = `pulse-${name}` as keyof typeof fontSize;
    expect([name, fontSize[key]]).toEqual([name, size]);
    // What is set is the drawn line, or the font's own height where the drawing's would crop it on Android.
    expect([name, step.lineSafe]).toEqual([name, Math.max(line, Math.ceil(size * FACE_LEADING[step.face]))]);
    expect([name, lineHeight[`pulse-${name}`]]).toEqual([name, step.lineSafe]);
    expect(step.cls).toContain(`text-pulse-${name}`);
  }
  expect(typeScale.hero.tracking).toBeCloseTo(-0.3, 5); // −1 % of 30
  expect(typeScale.edge.tracking).toBeCloseTo(2.64, 5); // 0.24 em of 11
  expect(typeStyle('row')).toEqual({ lineHeight: 20, letterSpacing: 0 });
});

it('G-P5: no step is set on a line shorter than its font is tall (Android crops it — the M17 "text has been cropped"); the Unbounded steps are taller than drawn', () => {
  for (const [name, st] of Object.entries(typeScale)) expect([name, st.lineSafe >= Math.ceil(st.size * FACE_LEADING[st.face])]).toEqual([name, true]);
  expect(typeScale.hero.line).toBe(31); // as drawn…
  expect(typeScale.hero.lineSafe).toBe(38); // …and as set: 30 × 1.24
  expect(typeStyle('hero')).toEqual({ lineHeight: 38, letterSpacing: -0.3 });
  // Geist and Geist Mono steps the drawings set tall enough are left as drawn.
  expect([typeScale.row.lineSafe, typeScale.body.lineSafe, typeScale.mono.lineSafe]).toEqual([20, 22, 22]);
});

it('the faces the type scale asks for are the faces the drawings use', () => {
  expect(typeScale.hero.cls).toContain('font-display');
  expect(typeScale.hero.cls).toContain('font-extrabold'); // Unbounded 800
  expect(typeScale.title.cls).toContain('font-display'); // 700
  expect(typeScale.section.cls).toContain('font-semibold'); // Geist 600
  expect(typeScale.mono.cls).toContain('font-mono');
});

it('the spacing scale is 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48, named, with the 16 gutter on a narrow phone', () => {
  expect([spacing.hair, spacing.gap, spacing.row, spacing.section, spacing.screenX, spacing.block, spacing.group, spacing.region]).toEqual([4, 8, 12, 16, 20, 24, 32, 48]);
  expect(gutter(390)).toBe(20);
  expect(gutter(375)).toBe(20);
  expect(gutter(360)).toBe(16);
});

it('radius: chip 7 · small cover 12 · bar and input 18 · card and cover 24 · dialog 28 · sheet 32', () => {
  expect([radius.chip, radius.small, radius.bar, radius.input, radius.card, radius.cover, radius.dialog, radius.sheet]).toEqual([7, 12, 18, 18, 24, 24, 28, 32]);
});

it('motion: tap 120 · move 240 · sheet 360 · breathe 2.4 s · bubble 1.2 s · now bar back after 600 ms', () => {
  expect([motion.tap, motion.move, motion.sheet, motion.breathe, motion.bubble, motion.nowReturn]).toEqual([120, 240, 360, 2400, 1200, 600]);
});

it('G-P3: the bars stack as drawn on a 34 pt inset — tab bar 92, now bar at 100, title bar 100 / 168, pushed 40 / 108, toast 176', () => {
  expect(bars.tab + 34).toBe(92);
  expect(bottomInset(34, { tabs: true })).toBe(92);
  expect(nowBarBottom(34, { tabs: true })).toBe(100); // the now bar floats 8 above the tab bar
  expect(titleBarBottom(34, { tabs: true })).toBe(100); // the title bar with only the tab bar
  expect(titleBarBottom(34, { tabs: true, now: true })).toBe(168); // over the now bar
  expect(titleBarBottom(34)).toBe(40); // a pushed page
  expect(nowBarBottom(34)).toBe(40); // …and its now bar
  expect(titleBarBottom(34, { now: true })).toBe(108); // …with the now bar under the title bar
  expect(bottomInset(34, { tabs: true, now: true })).toBe(158);
  expect(toastBottom(34)).toBe(176); // no options: both bars
  expect(toastBottom(34, { tabs: true, now: true })).toBe(176);
  expect(toastBottom(34, { tabs: true })).toBe(108); // the tab bar alone
  expect(toastBottom(34, {})).toBe(48); // a pushed page, no bar
  expect(toastBottom(34, { now: true })).toBe(116); // a pushed page with the now bar
  expect(toastBottom(34, { player: true })).toBe(112); // the player: clears the tray (design-pulse2 listen.html, toast at 112)
});

it('the generated CSS carries the Pulse steps with their line heights', () => {
  const css = readFileSync(join(MOBILE, 'global.css'), 'utf8');
  expect(css).toContain('--text-pulse-hero: 30px;');
  expect(css).toContain('--text-pulse-hero--line-height: 38px;');
  expect(css).toContain('--color-hot: #ff4d6d;');
  expect(css).toContain('--spacing-block: 24px;');
  expect(css).toContain('--radius-sheet: 32px;');
});

describe('G-P4: the wave rules of the token check (scripts/token-waves.mjs)', () => {
  const run = (lines: string[]): string[] => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { waveFindings } from './scripts/token-waves.mjs';
    console.log(JSON.stringify(waveFindings('x.tsx', ${JSON.stringify(lines)})));
  `], { cwd: MOBILE }).toString());

  it('an arbitrary text size is refused', () => {
    expect(run(['<Text className="text-text text-[15px]">'])).toHaveLength(1);
    expect(run(['<Text className="text-text leading-[22px] tracking-[2px]">'])).toHaveLength(2);
  });
  it('a number spacing is refused — plain, half, arbitrary, negative, with a variant', () => {
    expect(run(['className="p-3"'])).toHaveLength(1);
    expect(run(['className="gap-0.5 px-2"'])).toHaveLength(2);
    expect(run(['className="mt-[13px]"'])).toHaveLength(1);
    expect(run(['className="-ml-1.5"'])).toHaveLength(1);
    expect(run(['className="active:p-2"'])).toHaveLength(1);
  });
  it('the named scale and the Pulse text steps pass', () => {
    expect(run(['className="p-gap px-screen-x gap-row mt-block text-pulse-row text-text"'])).toEqual([]);
    expect(run(['className="w-12 h-48 flex-1 rounded-pill"'])).toEqual([]);
  });
  it('comments are not read', () => {
    expect(run([' * "p-3" in a comment', '// className="text-[15px]"'])).toEqual([]);
  });
});

describe('G-M31-T097: every screen and part follows the named spacing scale (no file hides outside the wave list)', () => {
  const out = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { PENDING, STRICT_STYLE_FILES, WAVE_FILES, waveFindings } from './scripts/token-waves.mjs';
    import { readFileSync, readdirSync, statSync } from 'node:fs';
    import path from 'node:path';
    const walk = (d, o = []) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) walk(p, o); else if (/\\.tsx$/.test(n)) o.push(p); } return o; };
    const inW = (f) => WAVE_FILES.some((w) => (w.endsWith('/') ? f.startsWith(w) : f === w));
    const outside = [...walk('app'), ...walk('src')].filter((f) => !f.startsWith('src/ui/lib/') && !inW(f));
    const dirty = outside.filter((f) => waveFindings(f, readFileSync(f, 'utf8').split('\\n')).length > 0);
    console.log(JSON.stringify({ PENDING, dirty, strictHasMarkdown: STRICT_STYLE_FILES.includes('src/ui/content/Markdown.tsx') }));
  `], { cwd: MOBILE }).toString());

  it('PENDING is empty', () => { expect(out.PENDING).toEqual([]); });
  it('no tsx file outside the wave list (and outside the vendored src/ui/lib) holds a number spacing or an arbitrary text size', () => { expect(out.dirty).toEqual([]); });
  it('the files T097 moved are strict-style files too', () => { expect(out.strictHasMarkdown).toBe(true); });
});
