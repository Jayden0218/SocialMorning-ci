// Tests the Moments data: the server call, the list hook (first page, more, failure, sign-in) and the saved Home view.
/**
 * M31 T025 (contracts/moments.md). The call: `GET /v1/discover/moments?limit=&cursor=`, signed out or in.
 * The list: the first page; the next page when asked, a moment the next page repeats listed once; a
 * failed read keeps the list and says so, with nothing shown it is the error state; a new viewer reads
 * again; coming back to Home reads again only when the list is 5 minutes old.
 * The break that turns it red: drop the `if (mine !== generation.current) return;` in `refresh` (a
 * stale answer lands after a sign-in) or the dedupe in `mergeMoments`.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createMomentsApi, type Moment, type MomentsApi, type MomentsPage } from '@/discover/moments-api';
import { useMomentsWith, type MomentsList } from '@/ui/discover/useMoments';
import { DEFAULT_HOME_VIEW, HOME_VIEW_KEY, chooseHomeView, currentHomeView, momentsOnScreen, readHomeView, resetHomeViewForTest, setHomeFocused } from '@/ui/discover/homeView';

jest.mock('@/telemetry/reportError', () => ({ reportError: jest.fn() }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ listener: undefined }) }));

const moment = (id: string, startMs = 0, reactions = 6): Moment => ({ episodeId: id, showTitle: 'S', episodeTitle: 'E' + id, startMs, endMs: startMs + 30_000, reactions, rank: 1, followed: false, comments: [] });
const page = (items: Moment[], next?: string): MomentsPage => ({ items, ...(next ? { next } : {}), computedAt: 'now' });

describe('the call', () => {
  it('asks for a page with the limit and the cursor, bearer token when signed in', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return new Response(JSON.stringify(page([moment('a')], 'c2')), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const api = createMomentsApi({ baseUrl: 'https://api', fetch: f, getToken: async () => 'tok' });
    const r = await api.list({ limit: 10, cursor: 'c1' });
    expect(r.items[0]!.episodeId).toBe('a');
    expect(r.next).toBe('c2');
    expect(calls[0]!.url).toBe('https://api/v1/discover/moments?limit=10&cursor=c1');
    expect(calls[0]!.headers['authorization']).toBe('Bearer tok');
    await createMomentsApi({ baseUrl: 'https://api', fetch: f, getToken: async () => undefined }).list();
    expect(calls[1]!.url).toBe('https://api/v1/discover/moments?limit=20');
    expect(calls[1]!.headers['authorization']).toBeUndefined();
  });
  it('a refusal is an error the hook can catch', async () => {
    const f = (async () => new Response(JSON.stringify({ error: 'validation', message: 'limit' }), { status: 422, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    await expect(createMomentsApi({ baseUrl: 'https://api', fetch: f, getToken: async () => undefined }).list({ limit: 99 })).rejects.toMatchObject({ code: 'validation', status: 422 });
  });
});

describe('the list hook', () => {
  let r: ReactTestRenderer | undefined;
  let last!: MomentsList;
  const setLast = (v: MomentsList): void => { last = v; };
  function Probe(p: { api: MomentsApi; viewer: string; now: () => number }): null {
    setLast(useMomentsWith(p.api, p.viewer, p.now));
    return null;
  }
  const mount = async (api: MomentsApi, viewer = 'anon', now: () => number = () => 0) => {
    await act(async () => { r = create(createElement(Probe, { api, viewer, now })); });
  };
  afterEach(() => { act(() => { r?.unmount(); }); r = undefined; });
  const fake = (pages: (MomentsPage | Error)[]): MomentsApi & { calls: { cursor?: string | undefined }[] } => {
    const calls: { cursor?: string | undefined }[] = [];
    return { calls, list: async (o = {}) => { calls.push({ cursor: o.cursor }); const p = pages[Math.min(calls.length - 1, pages.length - 1)]!; if (p instanceof Error) throw p; return p; } };
  };

  it('loads the first page, then the next on request; a repeated moment is listed once', async () => {
    const api = fake([page([moment('a'), moment('b')], 'c2'), page([moment('b'), moment('c')])]);
    await mount(api);
    expect(last.status).toBe('ready');
    expect(last.items.map((m) => m.episodeId)).toEqual(['a', 'b']);
    expect(last.more).toBe(true);
    await act(async () => { await last.loadMore(); });
    expect(last.items.map((m) => m.episodeId)).toEqual(['a', 'b', 'c']);
    expect(last.more).toBe(false);
    expect(api.calls.map((c) => c.cursor)).toEqual([undefined, 'c2']);
    await act(async () => { await last.loadMore(); });
    expect(api.calls).toHaveLength(2);
  });
  it('an empty answer is a ready, empty list (the empty state), not an error', async () => {
    await mount(fake([page([])]));
    expect(last.status).toBe('ready');
    expect(last.items).toEqual([]);
    expect(last.failed).toBe(false);
  });
  it('a failed first read is the error state; Try again recovers', async () => {
    const api = fake([new Error('down'), page([moment('a')])]);
    await mount(api);
    expect(last.status).toBe('error');
    await act(async () => { await last.refresh(); });
    expect(last.status).toBe('ready');
    expect(last.failed).toBe(false);
  });
  it('a failed refresh keeps the list that was shown and says it failed', async () => {
    const api = fake([page([moment('a')]), new Error('down')]);
    await mount(api);
    await act(async () => { await last.refresh(); });
    expect(last.status).toBe('ready');
    expect(last.items).toHaveLength(1);
    expect(last.failed).toBe(true);
  });
  it('a new viewer (sign-in) reads again from the start', async () => {
    const api = fake([page([moment('a')]), page([moment('z')])]);
    await mount(api, 'anon');
    await act(async () => { r!.update(createElement(Probe, { api, viewer: 'u1', now: () => 0 })); });
    expect(last.items.map((m) => m.episodeId)).toEqual(['z']);
    expect(api.calls).toHaveLength(2);
  });
  it('an old answer that lands after a newer read is dropped', async () => {
    let release!: (p: MomentsPage) => void;
    const slow = new Promise<MomentsPage>((res) => { release = res; });
    let n = 0;
    const api: MomentsApi = { list: () => (++n === 1 ? slow : Promise.resolve(page([moment('new')]))) };
    await mount(api, 'anon');
    await act(async () => { r!.update(createElement(Probe, { api, viewer: 'u1', now: () => 0 })); });
    await act(async () => { release(page([moment('old')])); await slow; });
    expect(last.items.map((m) => m.episodeId)).toEqual(['new']);
  });
  it('coming back reads again only after 5 minutes', async () => {
    let t = 1_000;
    const api = fake([page([moment('a')]), page([moment('b')])]);
    await mount(api, 'anon', () => t);
    act(() => last.refreshIfOld());
    expect(api.calls).toHaveLength(1);
    t += 5 * 60_000;
    await act(async () => { last.refreshIfOld(); });
    expect(api.calls).toHaveLength(2);
    expect(last.items.map((m) => m.episodeId)).toEqual(['b']);
  });
});

describe('the Home view', () => {
  const memory = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k), set: (k: string, v: string) => { m.set(k, v); } }; };
  beforeEach(() => resetHomeViewForTest());
  it('the first time it is Moments; an unreadable value is the default; the choice is kept', () => {
    const s = memory();
    expect(DEFAULT_HOME_VIEW).toBe('moments');
    expect(readHomeView(s)).toBe('moments');
    s.set(HOME_VIEW_KEY, 'nonsense');
    expect(readHomeView(s)).toBe('moments');
    chooseHomeView(s, 'discover');
    expect(s.get(HOME_VIEW_KEY)).toBe('discover');
    expect(currentHomeView(s)).toBe('discover');
    resetHomeViewForTest();
    expect(currentHomeView(s)).toBe('discover');
  });
  it('the layout hides the now bar only when Moments is chosen AND Home is in front', () => {
    const s = memory();
    currentHomeView(s);
    setHomeFocused(false);
    expect(momentsOnScreen()).toBe(false);
    setHomeFocused(true);
    expect(momentsOnScreen()).toBe(true);
    chooseHomeView(s, 'discover');
    expect(momentsOnScreen()).toBe(false);
    chooseHomeView(s, 'moments');
    setHomeFocused(false);
    expect(momentsOnScreen()).toBe(false);
  });
});
