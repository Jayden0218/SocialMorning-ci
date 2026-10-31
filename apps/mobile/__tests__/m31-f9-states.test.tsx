// A page whose load failed shows the page-level error (tile, sentence, Retry at the foot), not an inline card at the top.
/**
 * M31 F9 (specs/033-m31-redesign/contact/wave-6/README.md defect 3). Written BEFORE the fix: red today.
 * Drawing: design-pulse2 shell.html `states--error-page` (Issues · could not load): "Whole-page error: the 72 '!' tile and the page's own sentence in Unbounded 24.
 * Retry (light pill) in the bottom zone, under the title." — the shared EmptyState `page` variant (EmptyState.tsx already draws it: 72 tile, `statement` 24, a full-width light Retry).
 *  - Issues (`app/issues.tsx`) draws a `RetryTile` inline card instead.
 * Left alone, with the reason:
 *  - Friends listening: the drawing `states--error-inline` IS the inline card ("Inline error: a raise card with the sentence and Retry as a hot-text link") — the build matches it;
 *  - Notifications offline: shell.html `states--feed-offline` draws the whole page, social.html `notifications--feed-offline` (W4-C, built, pinned by m31-w4c-social) draws the
 *    block under the System / From hosts tiles; two drawings disagree, so no test (the coordinator can pick; "Retry" is already the spoken name there).
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

let mockIssues: () => Promise<unknown> = () => Promise.resolve([]);
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/issues',
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined, set: () => undefined } }), useToast: () => jest.fn() }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
const mockM12 = { issues: () => mockIssues() };
jest.mock('@/social/m12-api', () => ({ useM12Api: () => mockM12 }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));
import IssuesScreen from '../app/issues';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => { setReducedMotionForTest(true); });
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
async function render(): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(IssuesScreen)); for (let i = 0; i < 6; i++) await Promise.resolve(); });
  mounted.push(r);
  return r;
}
const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};

describe('F9-3 Issues, load failed (states--error-page)', () => {
  beforeEach(() => { mockIssues = () => Promise.reject(new Error('offline')); });
  it('the sentence is the page\'s own, in Unbounded 24, beside a 72 "!" tile', async () => {
    const r = await render();
    const sentence = r.root.findAll((x) => String(x.type) === 'Text' && say(x.props['children']) === "Couldn't load the issues right now.")[0];
    expect(sentence).toBeDefined();
    expect(flat(sentence)['fontSize']).toBe(24);
    expect(r.root.findAll((x) => typeof x.type === 'string' && flat(x)['width'] === 72 && flat(x)['height'] === 72)).not.toHaveLength(0);
    expect(r.root.findAll((x) => String(x.type) === 'Text' && say(x.props['children']) === '!')).not.toHaveLength(0);
  });
  it('Retry is the light pill in the foot (a button with the kit\'s light fill), and it asks again', async () => {
    const calls: number[] = [];
    mockIssues = () => { calls.push(1); return Promise.reject(new Error('offline')); };
    const r = await render();
    const retry = r.root.findAll((x) => x.props['accessibilityLabel'] === 'Retry' && x.props['accessibilityRole'] === 'button' && typeof x.props['onPress'] === 'function')[0];
    expect(retry).toBeDefined();
    expect(String(retry!.props['className'])).toContain('bg-text');
    const before = calls.length;
    await act(async () => { retry!.props['onPress'](); for (let i = 0; i < 6; i++) await Promise.resolve(); });
    expect(calls.length).toBe(before + 1);
  });
  it('the title bar keeps "Issues" and its subtitle under the error block', async () => {
    const r = await render();
    const w = r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));
    expect(w).toEqual(expect.arrayContaining(['Issues', 'Every issue so far, newest first.']));
  });
});
