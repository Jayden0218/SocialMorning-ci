// Tests that a launch promotion never slows start-up when nothing is cached.
/**
 * Guard G-L4 (specs/015-m15-admin/data-model.md, SC-004): a launch with nothing cached adds
 * no wait — the overlay is not mounted, and start-up never waits on `GET /v1/launch`.
 *
 * Three parts: `decideLaunch` answers synchronously from local data and never touches the
 * network; `src/ui/shell/providers.tsx` decides once at mount and starts `syncLaunch` only after
 * `ready`, without awaiting it or adding it to the start-up tasks; and the overlay itself
 * (Skip first, the label, 3 s, a tap).
 *
 * The break that turns it red: await the list fetch before hiding the splash — e.g. add
 * `startupTasks.current.push(syncLaunch({ … }))` (or `await launchApi.list()`) in
 * `src/ui/shell/providers.tsx`; the "providers" test fails.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { decideLaunch, recordShown } from '@/launch/decide';
import { localDay, type Promotion } from '@/launch/choose';
import { LAUNCH_KEYS, readFiles, readList, readShown, writeFiles, writeList } from '@/launch/store';
import { syncLaunch } from '@/launch/sync';
import type { LaunchFiles } from '@/launch/launch-files';
import { createMemorySettingsStore } from '@/storage/memory';
import { setPref } from '@/settings/prefs';
import { LaunchScreen } from '@/ui/shell/LaunchScreen';

const NOW = Date.parse('2026-10-01T09:00:00Z');
const promo = (id: string, over: Partial<Promotion> = {}): Promotion => ({
  id, imageUrl: `https://blob.example/launch/${id}.png`, targetKind: 'route', target: '/chart', label: 'Promotion',
  startsAt: '2026-09-30T00:00:00Z', endsAt: '2026-10-03T00:00:00Z', weight: 1, dailyCap: 1, ...over,
});

/** Files on a fake disk. */
function fakeFiles(onDisk: string[] = []): LaunchFiles & { disk: Set<string>; downloads: string[] } {
  const disk = new Set(onDisk);
  const downloads: string[] = [];
  return {
    disk, downloads,
    uri: (id) => (disk.has(id) ? `file:///cache/launch/${id}.png` : undefined),
    ids: () => [...disk],
    download: async (id, url) => { if (url.includes('broken')) throw new Error('404'); downloads.push(id); disk.add(id); },
    remove: (id) => { disk.delete(id); },
  };
}

const decide = (settings = createMemorySettingsStore(), files: Pick<LaunchFiles, 'uri'> = fakeFiles(), over: Partial<Parameters<typeof decideLaunch>[0]> = {}) =>
  decideLaunch({ settings, files, now: NOW, signedIn: true, termsDue: false, random: () => 0, ...over });

describe('decideLaunch — local data only, synchronous', () => {
  it('nothing cached → no overlay, decided without a Promise and without fetch', () => {
    const fetchSpy = jest.fn();
    const saved = global.fetch;
    global.fetch = fetchSpy as never;
    try {
      const settings = createMemorySettingsStore();
      writeList(settings, [promo('a')]);
      const result = decide(settings, fakeFiles());
      expect(result).toBeUndefined();
      expect((result as unknown) instanceof Promise).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { global.fetch = saved; }
  });

  it('recorded as cached but emptied by the OS → none (the disk is checked)', () => {
    const settings = createMemorySettingsStore();
    writeList(settings, [promo('a')]);
    writeFiles(settings, new Set(['a']));
    expect(decide(settings, fakeFiles([]))).toBeUndefined();
  });

  it('a cached, live promotion → the overlay, with its file', () => {
    const settings = createMemorySettingsStore();
    writeList(settings, [promo('a')]);
    writeFiles(settings, new Set(['a']));
    expect(decide(settings, fakeFiles(['a']))).toEqual({ promotion: promo('a'), uri: 'file:///cache/launch/a.png' });
  });

  it('minor mode from the settings store, the Terms and the sign-in all say none', () => {
    const settings = createMemorySettingsStore();
    writeList(settings, [promo('a')]);
    writeFiles(settings, new Set(['a']));
    const files = fakeFiles(['a']);
    expect(decide(settings, files, { signedIn: false })).toBeUndefined();
    expect(decide(settings, files, { termsDue: true })).toBeUndefined();
    setPref(settings, 'hideExplicit', true);
    expect(decide(settings, files)).toBeUndefined();
  });

  it('the daily cap counts impressions on this phone, per local day', () => {
    const settings = createMemorySettingsStore();
    writeList(settings, [promo('a')]);
    writeFiles(settings, new Set(['a']));
    recordShown(settings, 'a', NOW);
    expect(readShown(settings)).toEqual({ day: localDay(NOW), counts: { a: 1 } });
    expect(decide(settings, fakeFiles(['a']))).toBeUndefined();
  });

  it('a broken settings row means no launch screen, not a crash', () => {
    const settings = createMemorySettingsStore();
    settings.set(LAUNCH_KEYS.list, '{not json');
    settings.set(LAUNCH_KEYS.files, '"a"');
    settings.set(LAUNCH_KEYS.shown, 'null');
    expect(readList(settings)).toEqual([]);
    expect(readFiles(settings)).toEqual(new Set());
    expect(readShown(settings)).toBeUndefined();
    expect(decide(settings, fakeFiles(['a']))).toBeUndefined();
  });
});

describe('syncLaunch — for the next launch', () => {
  it('saves the list, downloads missing images, deletes stale ones', async () => {
    const settings = createMemorySettingsStore();
    const files = fakeFiles(['old']);
    writeFiles(settings, new Set(['old']));
    await syncLaunch({ api: { list: async () => [promo('a'), promo('b', { imageUrl: 'https://blob.example/broken.png' })] }, files, settings });
    expect(readList(settings).map((p) => p.id)).toEqual(['a', 'b']);
    expect(files.downloads).toEqual(['a']);
    expect([...files.disk]).toEqual(['a']);
    expect(readFiles(settings)).toEqual(new Set(['a']));
  });

  it('offline: the old list and files stay, and it never rejects', async () => {
    const settings = createMemorySettingsStore();
    writeList(settings, [promo('a')]);
    writeFiles(settings, new Set(['a']));
    const files = fakeFiles(['a']);
    await expect(syncLaunch({ api: { list: async () => { throw new Error('offline'); } }, files, settings })).resolves.toBeUndefined();
    expect(readList(settings).map((p) => p.id)).toEqual(['a']);
    expect(files.disk.has('a')).toBe(true);
  });
});

describe('providers.tsx — start-up never waits on the launch list', () => {
  const src = readFileSync(join(__dirname, '..', 'src', 'ui', 'shell', 'providers.tsx'), 'utf8');

  it('decides once, at mount, synchronously', () => {
    expect(src).toMatch(/useState\(\(\) => decideLaunch\(\{/);
  });

  it('syncLaunch runs only after `ready`, fire-and-forget', () => {
    expect(src.match(/syncLaunch\(/g)).toHaveLength(1);
    expect(src).toMatch(/if \(!ready\) return;\s*\n\s*void syncLaunch\(/);
  });

  it('nothing launch-related is awaited or added to the start-up tasks', () => {
    expect(src).not.toMatch(/await\s+(syncLaunch|launchApi|launchFiles)/);
    expect(src).not.toMatch(/startupTasks\.current\.push\([^;]*(syncLaunch|launchApi|launchFiles)/);
    const wait = /waitForStartup\(([^)]*)\)/.exec(src);
    expect(wait?.[1]).toBeDefined();
    expect(wait![1]).not.toMatch(/launch/i);
  });

  it('the overlay is mounted only when a pick exists', () => {
    expect(src).toMatch(/\{launchPick \? \(\s*\n\s*<LaunchScreen/);
  });
});

describe('the overlay', () => {
  const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance =>
    r.root.find((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const mount = (started: boolean, handlers: { onShown?: jest.Mock; onTap?: jest.Mock; onDone?: jest.Mock } = {}) => {
    const props = { promotion: { id: 'a', label: 'Promotion' }, uri: 'file:///a.png', started, onShown: handlers.onShown ?? jest.fn(), onTap: handlers.onTap ?? jest.fn(), onDone: handlers.onDone ?? jest.fn() };
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(LaunchScreen, props)); });
    return { r, props };
  };

  it('Skip is the first thing a screen reader reaches; the label shows', () => {
    const { r } = mount(true);
    const reachable = r.root.findAll((n) => typeof n.props['onPress'] === 'function' && typeof n.props['accessibilityLabel'] === 'string'
      && n.props['accessible'] !== false && n.props['accessibilityElementsHidden'] !== true);
    expect(reachable[0]?.props['accessibilityLabel']).toBe('Skip');
    expect(JSON.stringify(r.toJSON())).toContain('Promotion');
    expect(JSON.stringify(r.toJSON())).toContain('Skip 3');
  });

  it('the 3 s start only once the splash has hidden; then it closes by itself', () => {
    const onShown = jest.fn();
    const onDone = jest.fn();
    const { r, props } = mount(false, { onShown, onDone });
    act(() => { jest.advanceTimersByTime(5_000); });
    expect(onShown).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    act(() => { r.update(createElement(LaunchScreen, { ...props, started: true })); });
    expect(onShown).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(3_000); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('Skip closes at once; a tap on the promotion opens it and closes', () => {
    const skip = mount(true, { onDone: jest.fn() });
    act(() => { byLabel(skip.r, 'Skip').props['onPress'](); });
    expect(skip.props.onDone).toHaveBeenCalledTimes(1);
    const tap = mount(true, { onTap: jest.fn(), onDone: jest.fn() });
    act(() => { byLabel(tap.r, 'Promotion. Opens the promotion').props['onPress'](); });
    expect(tap.props.onTap).toHaveBeenCalledTimes(1);
    expect(tap.props.onDone).toHaveBeenCalledTimes(1);
    // The clock running out after a tap does not close it twice.
    act(() => { jest.advanceTimersByTime(3_000); });
    expect(tap.props.onDone).toHaveBeenCalledTimes(1);
  });
});
