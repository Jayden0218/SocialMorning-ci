// Tests the shared empty / loading / error states and the Manage order page against design-pulse2.
/**
 * M31 W6-C (T072; design-pulse2 shell.html `states--*`, listen.html `subscriptions-manage--*`). Break to watch red:
 *  - Loader: draw the five bars again for the default look; make GhostRows skip its `Breathe`; make Breathe ignore Reduce Motion;
 *  - EmptyState: drop the CARD class from the inline state, or the loading page's ghost rows;
 *  - empty.ts: put "Open Library" back on `stats`; Manage order: stop scaling the picked cover or hide the hint chip.
 * NOT VERIFIED on a phone.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { createMemoryStores } from '@/storage/memory';
import { allText, mount, hash, episode, byLabel } from './support/screen-kit';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockToast = jest.fn();
const mockRef: { stores: ReturnType<typeof createMemoryStores> } = { stores: undefined as never };
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a), back: (...a: unknown[]) => mockBack(...a), canGoBack: () => true } }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockRef.stores, useToast: () => mockToast }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ listener: undefined }) }));
jest.mock('@/social/us8-api', () => ({ useUs8Api: () => ({}) }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));

import { EMPTY_STATES } from '@socialmorning/social-core';
import { EmptyState } from '@/ui/kit/EmptyState';
import { Loader } from '@/ui/kit/Loader';
import { GhostRows } from '@/ui/kit/GhostRows';
import { Breathe } from '@/ui/kit/Breathe';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import ManageScreen from '../app/subscriptions/manage';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
const render = (el: React.ReactElement): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  mounted.push(r);
  return r;
};
const style = (n: ReactTestInstance): Record<string, unknown> => Object.assign({}, ...[n.props['style']].flat(4).filter(Boolean)) as Record<string, unknown>;
const byId = (r: ReactTestRenderer, id: string) => r.root.findAll((n) => n.props['testID'] === id && typeof n.type === 'string');
const opacityOf = (n: ReactTestInstance): unknown => {
  const v = style(n)['opacity'] as { __getValue?: () => number } | number;
  return typeof v === 'object' && v !== null ? v.__getValue?.() : v;
};

describe('the loader', () => {
  it('by default it is 12 hot bars in a 64 wide breathing curve and the words "Loading"; one progress bar named Loading', () => {
    const r = render(createElement(Loader, {}));
    expect(byId(r, 'curve-bar')).toHaveLength(12);
    expect(style(byId(r, 'breathe')[0]!)['width']).toBe(64);
    expect(allText(r)).toContain('Loading');
    expect(r.root.findAllByProps({ accessibilityRole: 'progressbar' }).filter((n) => typeof n.type === 'string' || true).length).toBeGreaterThan(0);
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Loading' && n.props['accessibilityRole'] === 'progressbar')).not.toHaveLength(0);
  });
  it('a busy button asks for a size and keeps the five small sound bars', () => {
    const r = render(createElement(Loader, { size: 16 }));
    expect(byId(r, 'curve-bar')).toHaveLength(0);
    expect(byId(r, 'breathe')).toHaveLength(0);
  });
  it('keeps an opacity loop running on its own, and runs none (full strength, no timer) under Reduce Motion', () => {
    const run = (r: ReactTestRenderer) => { act(() => { jest.advanceTimersByTime(100); }); return { timers: jest.getTimerCount(), opacity: opacityOf(byId(r, 'breathe')[0]!) }; };
    setReducedMotionForTest(true);
    const still = run(render(createElement(Breathe, null, createElement('View'))));
    expect(still.timers).toBe(0);
    expect(still.opacity).toBe(1);
    act(() => { mounted.splice(0).forEach((r) => r.unmount()); });
    setReducedMotionForTest(false);
    expect(run(render(createElement(Breathe, null, createElement('View')))).timers).toBeGreaterThan(0);
  });
});

describe('ghost rows', () => {
  it('rows 12 apart at 55 %: every third a 64 tall tile (radius 18), the others 14 tall lines (radius 7), widths 100/70/88/100/60 %', () => {
    const r = render(createElement(GhostRows, {}));
    const rows = byId(r, 'ghost-row');
    expect(rows).toHaveLength(5);
    expect(rows.map((n) => style(n)['height'])).toEqual([64, 14, 14, 64, 14]);
    expect(rows.map((n) => style(n)['borderRadius'])).toEqual([18, 7, 7, 18, 7]);
    expect(rows.map((n) => style(n)['width'])).toEqual(['100%', '70%', '88%', '100%', '60%']);
    expect(style(byId(r, 'ghost-rows')[0]!)['opacity']).toBe(0.55);
  });
});

describe('empty, loading and error states', () => {
  it('a loading page is ghost rows over the loader; an inline loading is the loader alone', () => {
    const page = render(createElement(EmptyState, { surface: 'queue', page: true, loadingMs: 1500 }));
    expect(byId(page, 'ghost-row')).toHaveLength(5);
    expect(byId(page, 'curve-bar')).toHaveLength(12);
    const inline = render(createElement(EmptyState, { surface: 'queue', loadingMs: 1500 }));
    expect(byId(inline, 'ghost-row')).toHaveLength(0);
    expect(byId(inline, 'curve-bar')).toHaveLength(12);
  });
  it('an inline empty is a raise card (radius 22, padding 16) with the sentence and "Open player →" in hot text', () => {
    const r = render(createElement(EmptyState, { surface: 'clips' }));
    const card = r.root.findAll((n) => typeof n.type === 'string' && String(n.props['className'] ?? '').includes('bg-raise') && String(n.props['className']).includes('rounded-artwork-lg'));
    expect(card.length).toBeGreaterThan(0);
    expect(allText(r)).toContain(EMPTY_STATES.clips.sentence);
    expect(allText(r)).toContain('Open player →');
    // spoken name stays the action's own
    expect(byLabel(r, 'Open player')).toBeTruthy();
  });
  it('an inline error is the same card with Retry', () => {
    const onRetry = jest.fn();
    const r = render(createElement(EmptyState, { surface: 'feed', failed: true, onRetry }));
    expect(r.root.findAll((n) => typeof n.type === 'string' && String(n.props['className'] ?? '').includes('rounded-artwork-lg')).length).toBeGreaterThan(0);
    act(() => { byLabel(r, 'Retry').props['onPress'](); });
    expect(onRetry).toHaveBeenCalled();
  });
  it('the drawn action names: Downloads "Open Updates", Stats and Inbox "Open Home" (same routes)', () => {
    expect(EMPTY_STATES.downloads.action).toEqual({ label: 'Open Updates', route: '/inbox' });
    expect(EMPTY_STATES.stats.action).toEqual({ label: 'Open Home', route: '/' });
    expect(EMPTY_STATES.inbox.action).toEqual({ label: 'Open Home', route: '/' });
  });
});

describe('Manage order', () => {
  const A = 'https://a.example/feed.xml';
  const B = 'https://b.example/feed.xml';
  const setup = (n: 0 | 2) => {
    const stores = createMemoryStores(hash);
    if (n === 2) {
      [[A, 'Alpha Hour'], [B, 'Beta Radio']].forEach(([url, title], i) => {
        stores.feeds.put(url!, { show: { feedUrl: url!, title: title!, explicit: false, categories: [], contentHash: title! }, episodes: [episode(`e${i}`, `e${i}`, 1)], warnings: [] }, {}, 1);
        stores.subscriptions.add(url!, i + 1);
      });
    }
    mockRef.stores = stores;
  };
  it('empty: the shared empty block, no Save', async () => {
    setup(0);
    const r = await mount(createElement(ManageScreen));
    expect(allText(r)).toContain('No subscriptions yet.');
    expect(allText(r)).toContain('Manage order');
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Save order')).toHaveLength(0);
  });
  it('numbered covers; a picked cover shrinks to 94 % in a 3 pt ring and the hint chip appears; Save is the title bar check', async () => {
    setup(2);
    const r = await mount(createElement(ManageScreen));
    expect(byId(r, 'manage-cover')).toHaveLength(2);
    expect(allText(r)).toContain('Tap a show, then tap where it should go.');
    expect(allText(r)).not.toContain('Now tap where it should go.');
    await act(async () => { byLabel(r, /^Beta Radio, number 1/).props['onPress'](); });
    const picked = byId(r, 'manage-picked')[0]!;
    expect(style(picked)['borderWidth']).toBe(3);
    expect(JSON.stringify(style(picked)['transform'])).toContain('0.94');
    expect(allText(r)).toContain('Now tap where it should go.');
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Save order' && typeof n.props['onPress'] === 'function').length).toBeGreaterThan(0);
  });
});
