// @vitest-environment jsdom
// M30 T017: the corner badge shows DEV / QA / STAGING from VITE_APP_ENV and nothing on prod, empty or unknown.
// Break: in src/shell/EnvBadge.tsx add `prod: { label: 'PROD', … }` to BADGES — the "nothing" test goes red. Looks in a real browser: NOT VERIFIED.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { BADGES, EnvBadge } from '../src/shell/EnvBadge';
import { dark, light, type Role } from '../src/tokens';

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
const shown = (env: string | undefined): string => {
  if (env === undefined) vi.stubEnv('VITE_APP_ENV', ''); else vi.stubEnv('VITE_APP_ENV', env);
  return render(<EnvBadge />).container.textContent ?? '';
};

describe('Studio EnvBadge', () => {
  it('shows nothing for prod, empty or unknown', () => {
    expect(shown('prod')).toBe('');
    cleanup();
    expect(shown(undefined)).toBe('');
    cleanup();
    expect(shown('banana')).toBe('');
  });

  it('shows QA, DEV and STAGING', () => {
    expect(shown('qa')).toBe('QA');
    cleanup();
    expect(shown('dev')).toBe('DEV');
    cleanup();
    expect(shown('staging')).toBe('STAGING');
  });

  // jsdom drops `var(--x)` colours from inline styles, so the colours are read from the table the component renders from.
  it('QA is yellow (the primary token); every pair is a token pair with AA contrast in light and dark', () => {
    expect(BADGES['qa']!.bg).toBe('var(--primary)');
    const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
    const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
    const role = (v: string) => v.replace(/^var\(--/, '').replace(/\)$/, '').replace(/-(\w)/g, (_, c: string) => c.toUpperCase()) as Role;
    for (const b of Object.values(BADGES)) {
      expect(b.bg + b.fg).not.toMatch(/#[0-9a-f]{3,6}|rgb/i);
      for (const p of [light, dark]) expect(ratio(p[role(b.bg)], p[role(b.fg)])).toBeGreaterThanOrEqual(4.5);
    }
  });
});
