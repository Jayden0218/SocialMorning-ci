// Checks that every redesigned screen lists its design and an existing entry file.
/**
 * M17 guard G-E6: the surface registry is whole — 84 in-scope surfaces (86 designs less the two
 * Coming soon designs with no entry point, FR-016), each naming a stored B design and an entry
 * file that exists.
 *
 * The break that turns it red: remove one name from m17/designs.json (or one file the registry
 * names).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const surfaces = JSON.parse(readFileSync(join(ROOT, 'm17', 'surfaces.json'), 'utf8')) as { name: string; design: string; entry: string; wave: string }[];
const designs = new Set(JSON.parse(readFileSync(join(ROOT, 'm17', 'designs.json'), 'utf8')) as string[]);

it('G-E6: 84 surfaces in six waves, each with its design and entry file', () => {
  expect(surfaces).toHaveLength(84);
  expect(designs.size).toBe(86);
  const waves = surfaces.reduce<Record<string, number>>((m, s) => ({ ...m, [s.wave]: (m[s.wave] ?? 0) + 1 }), {});
  expect(waves).toEqual({ W1: 10, W2: 11, W3: 10, W4: 14, W5: 18, W6: 21 });
  const bad = surfaces.filter((s) => !designs.has(s.design) || !existsSync(join(ROOT, '..', '..', s.entry))).map((s) => s.name);
  expect(bad).toEqual([]);
  expect(surfaces.some((s) => s.name === 'ComingSoonTips' || s.name === 'ComingSoonIOSExtras')).toBe(false);
});
