/**
 * M10b dark mode, class side. Two promises:
 * 1. global.css carries a dark set with the same variable names as the light set (UniWind
 *    refuses themes whose names differ) — read from the generated file itself.
 * 2. The Appearance setting reaches UniWind as it is: System follows the phone, Light and Dark
 *    pin it. The break: DARK_READY = false in src/design/theme.ts (everything becomes light).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Uniwind } from 'uniwind';
import { applyAppearance, DARK_READY } from '../src/design/theme';

const css = readFileSync(path.join(__dirname, '..', 'global.css'), 'utf8');
const vars = (variant: string): string[] => {
  const body = new RegExp(`@variant ${variant} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  return [...body.matchAll(/--([\w-]+):/g)].map((m) => m[1]!).sort();
};

it('global.css has a light and a dark set with the same variable names', () => {
  expect(vars('light').length).toBeGreaterThan(5);
  expect(vars('dark')).toEqual(vars('light'));
});

it('the Appearance setting reaches the theme: system, light and dark each as chosen', () => {
  const spy = jest.spyOn(Uniwind, 'setTheme').mockImplementation(() => undefined);
  expect(DARK_READY).toBe(true);
  for (const a of ['system', 'light', 'dark'] as const) {
    applyAppearance(a);
    expect(spy).toHaveBeenLastCalledWith(a);
  }
  spy.mockRestore();
});
