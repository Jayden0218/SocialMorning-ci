// 039 verifier fix 2: content inside a Page / PageList starts on the page's 20 gutter; the old 28 "lane" (for the vertical edge label) is gone.
/**
 * The page frame owns the side gutter, so a part that adds its own `marginLeft: <28 lane>` starts 8 too far in. Guards (each seen red, see
 * specs/039-layout-system/red-evidence.md): put `marginLeft: 28` back on HotMoments' empty state or on ErrTile; draw the digest error as ErrTile again;
 * add a `.lane` read of any measure but `DECK.lane` (20) to the source.
 */
import { createElement } from 'react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import { HotMoments } from '@/ui/show/HotMoments';
import { ErrTile } from '@/ui/chat/blocks';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
const render = (el: React.ReactElement): ReactTestRenderer => { let r!: ReactTestRenderer; act(() => { r = create(el); }); mounted.push(r); return r; };
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance => r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === id)[0]!;

it('the empty hot-moments block adds no left margin (the page gives the 20 gutter)', () => {
  const r = render(createElement(HotMoments, { status: 'ready', cards: [], all: [], durationOf: () => 0, onPlay: jest.fn(), onRetry: jest.fn() }));
  const box = r.root.findAll((n) => typeof n.type === 'string' && n.parent !== null && flat(n)['marginLeft'] !== undefined);
  expect(box.map((n) => flat(n)['marginLeft'])).toEqual([]);
  expect(JSON.stringify(r.toJSON())).toContain('No hot moments yet');
});

it('the error tile adds no side margins (it starts on the gutter)', () => {
  const r = render(createElement(ErrTile, { line: "Couldn't load more." }));
  const s = flat(byId(r, 'err-tile'));
  expect([s['marginLeft'], s['marginRight']]).toEqual([undefined, undefined]);
});

it('no source file reads a 28 lane: the only `.lane` is DECK.lane (20)', () => {
  const hits: string[] = [];
  const walk = (dir: string): void => {
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) { if (f !== '__tests__') walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(f)) continue;
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (/^\s*(\*|\/\/)/.test(line)) return;
        if (/\b(?!DECK\b)[A-Z_]+\.lane\b/.test(line)) hits.push(`${p}:${i + 1}`);
      });
    }
  };
  walk(path.join(__dirname, '../src'));
  walk(path.join(__dirname, '../app'));
  expect(hits).toEqual([]);
});
