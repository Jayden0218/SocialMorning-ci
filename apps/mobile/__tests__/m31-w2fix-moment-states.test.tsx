// The Moments search tab's error block with Retry, and no "No moments match." while pages are still being read.
/**
 * M31 wave-2 fix (verifier finding): MomentGrid drew nothing on status 'error', and said "No moments match." after the
 * first page while up to four more were still to be read. Each is tried red once: draw nothing on 'error'; let the
 * hook answer 'ready' while `more` pages remain.
 */
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { MomentGrid, useMomentResults, type MomentResultsState } from '@/ui/search/MomentResults';
import type { MomentsList } from '@/ui/discover/useMoments';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: () => ({ buckets: undefined, durationMs: undefined, comments: undefined, mine: undefined }) }));
let mockList: MomentsList;
jest.mock('@/ui/discover/useMoments', () => ({ useMoments: () => mockList }));

const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); });
function render(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  mounted.push(r);
  return r;
}
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));
const retry = (r: ReactTestRenderer): ReactTestInstance[] => r.root.findAll((n) => n.props['accessibilityLabel'] === 'Retry' && typeof n.props['onPress'] === 'function');

describe('MomentGrid on a failed read', () => {
  it('says it could not load and offers Retry, which reads again', () => {
    const onRetry = jest.fn();
    const r = render(createElement(MomentGrid, { results: { status: 'error', hits: [], retry: onRetry }, onPlay: jest.fn() }));
    expect(words(r).join(' ')).toMatch(/Couldn't load this/);
    expect(words(r)).not.toContain('No moments match.');
    act(() => { retry(r)[0]!.props['onPress'](); });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('useMomentResults while pages remain', () => {
  const list = (over: Partial<MomentsList>): MomentsList => ({ status: 'ready', items: [], more: false, loadingMore: false, failed: false, refresh: jest.fn(async () => undefined), loadMore: jest.fn(async () => undefined), refreshIfOld: jest.fn(), ...over });
  const probe = (): MomentResultsState => {
    let seen!: MomentResultsState;
    const setSeen = (v: MomentResultsState): void => { seen = v; };
    const P = (): null => { setSeen(useMomentResults('zebra', true)); return null; };
    render(createElement(P));
    return seen;
  };
  it('is loading (not ready with nothing) while the five pages are not all read and nothing matched', () => {
    mockList = list({ items: [], more: true });
    expect(probe().status).toBe('loading');
  });
  it('is ready with nothing once the pages are read, and an error (with Retry) when a read failed and nothing matched', () => {
    mockList = list({ more: false });
    expect(probe().status).toBe('ready');
    const refresh = jest.fn(async () => undefined);
    mockList = list({ more: true, failed: true, refresh });
    const s = probe();
    expect(s.status).toBe('error');
    s.retry?.();
    expect(refresh).toHaveBeenCalled();
  });
  it('does not ask for more pages again after a failed read (no retry loop)', () => {
    const loadMore = jest.fn(async () => undefined);
    mockList = list({ more: true, failed: true, loadMore });
    probe();
    expect(loadMore).not.toHaveBeenCalled();
  });
});
