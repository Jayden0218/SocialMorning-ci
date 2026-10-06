// Tests the Apple Watch link's phone side: which position wins, when "Download to Watch" shows, and the Watch's colours.
/**
 * M21 US12 (FR-105). The pure rules in `src/sync/watch.ts`, the JS side of `modules/watch-link`
 * (no native module = no Watch, never a crash) and `targets/watch/Theme.swift` against the tokens.
 *
 * The break that turns it red: in src/sync/watch.ts make `watchPositionWins` return true when the
 * phone's row is newer (drop the `updatedAt` comparison) — "the phone's newer position stays" fails.
 * Also: in modules/watch-link/index.ts return `paired: true` when the native call throws, or change
 * one hex in targets/watch/Theme.swift.
 *
 * Whether a real Watch receives, downloads, plays and sends back is NOT VERIFIED (quickstart B19).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMemoryPositionStore } from '@/storage/memory';
import { applyWatchPosition, parseWatchPosition, showDownloadToWatch, startWatchLink, toWatchEpisode, watchPositionWins } from '@/sync/watch';
import { colour } from '@/design/tokens';

let mockNative: Record<string, unknown> | null = null;
let mockThrows = false;

jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => {
    if (mockThrows) throw new Error('no JSI');
    return name === 'WatchLink' ? mockNative : null;
  },
}));

import { onPositions, sendEpisode, watchState } from '../modules/watch-link';

beforeEach(() => { mockNative = null; mockThrows = false; });

const at = (episodeId: string, positionMs: number, updatedAt: number, extra: Record<string, unknown> = {}) =>
  ({ kind: 'position', episodeId, positionMs, updatedAt, finished: false, ...extra });

describe('which position wins', () => {
  it('a Watch position for an episode the phone never played is taken', () => {
    const positions = createMemoryPositionStore();
    const row = applyWatchPosition({ positions, now: () => 5_000, playingNow: () => undefined }, at('e1', 61_000, 4_000, { durationMs: 3_600_000 }));
    expect(row).toMatchObject({ episodeId: 'e1', offsetMs: 61_000, durationMsAtSave: 3_600_000, finished: false, explicitSeek: false });
    expect(positions.get('e1')?.offsetMs).toBe(61_000);
    // It is a normal save: progressSeq grew, so the position sync uploads it.
    expect(positions.unsynced().map((r) => r.episodeId)).toEqual(['e1']);
  });

  it("the phone's newer position stays; the Watch's newer one replaces it", () => {
    const positions = createMemoryPositionStore();
    positions.save({ episodeId: 'e1', offsetMs: 100_000, finished: false }, 10_000);
    expect(applyWatchPosition({ positions, now: () => 11_000, playingNow: () => undefined }, at('e1', 500_000, 9_000))).toBeUndefined();
    expect(positions.get('e1')?.offsetMs).toBe(100_000);
    // Equal times: the phone keeps its own.
    expect(applyWatchPosition({ positions, now: () => 11_000, playingNow: () => undefined }, at('e1', 500_000, 10_000))).toBeUndefined();
    expect(applyWatchPosition({ positions, now: () => 12_000, playingNow: () => undefined }, at('e1', 500_000, 10_001))?.offsetMs).toBe(500_000);
  });

  it('a Watch that moved BACK is saved as a seek, so the server keeps it', () => {
    const positions = createMemoryPositionStore();
    positions.save({ episodeId: 'e1', offsetMs: 900_000, finished: false, durationMsAtSave: 2_000_000 }, 10_000);
    const row = applyWatchPosition({ positions, now: () => 30_000, playingNow: () => undefined }, at('e1', 300_000, 20_000));
    expect(row).toMatchObject({ offsetMs: 300_000, explicitSeek: true, durationMsAtSave: 2_000_000 });
  });

  it('never while the phone is playing that episode; another episode is fine', () => {
    const local = undefined;
    const p = parseWatchPosition(at('e1', 1_000, 1))!;
    expect(watchPositionWins(local, p, 'e1')).toBe(false);
    expect(watchPositionWins(local, p, 'e2')).toBe(true);
  });

  it('finished on the Watch is finished on the phone', () => {
    const positions = createMemoryPositionStore();
    const row = applyWatchPosition({ positions, now: () => 2, playingNow: () => undefined }, at('e1', 3_600_000, 1, { finished: true }));
    expect(row?.finished).toBe(true);
  });

  it('anything that is not a position is ignored', () => {
    for (const raw of [null, undefined, 3, 'x', {}, { kind: 'episode', episodeId: 'e', positionMs: 1, updatedAt: 1 },
      { episodeId: '', positionMs: 1, updatedAt: 1 }, { episodeId: 'e', positionMs: Number.NaN, updatedAt: 1 },
      { episodeId: 'e', positionMs: 1 }, { episodeId: 7, positionMs: 1, updatedAt: 1 }]) {
      expect(parseWatchPosition(raw)).toBeUndefined();
    }
    expect(parseWatchPosition({ episodeId: 'e', positionMs: -5.4, updatedAt: 1, durationMs: 0 })).toEqual({ episodeId: 'e', positionMs: 0, finished: false, updatedAt: 1 });
  });

  it('startWatchLink saves each winning position and flushes; the losers do nothing', () => {
    const positions = createMemoryPositionStore();
    positions.save({ episodeId: 'old', offsetMs: 5, finished: false }, 100);
    let deliver: (raw: unknown) => void = () => undefined;
    const stop = jest.fn();
    const applied: string[] = [];
    const off = startWatchLink({
      link: { onPositions: (fn) => { deliver = fn; return stop; } },
      positions, now: () => 200, playingNow: () => undefined,
      onApplied: (row) => applied.push(row.episodeId),
    });
    deliver(at('new', 10, 150));
    deliver(at('old', 10, 50));
    deliver('junk');
    expect(applied).toEqual(['new']);
    off();
    expect(stop).toHaveBeenCalled();
  });
});

describe('"Download to Watch"', () => {
  it('shows only with a paired Watch that has the app, for an http(s) audio address (US12 scenario 1)', () => {
    expect(showDownloadToWatch({ paired: false, installed: false }, 'https://cdn/a.mp3')).toBe(false);
    expect(showDownloadToWatch({ paired: true, installed: false }, 'https://cdn/a.mp3')).toBe(false);
    expect(showDownloadToWatch({ paired: true, installed: true }, 'https://cdn/a.mp3')).toBe(true);
    expect(showDownloadToWatch({ paired: true, installed: true }, 'HTTP://cdn/a.mp3')).toBe(true);
    expect(showDownloadToWatch({ paired: true, installed: true }, 'file:///local.mp3')).toBe(false);
    expect(showDownloadToWatch({ paired: true, installed: true }, undefined)).toBe(false);
  });

  it('sends the publisher address, the show, and where the listener is (0 once finished)', () => {
    const e = { id: 'e1', title: 'T', enclosureUrl: 'https://cdn/a.mp3', imageUrl: 'https://img', durationMs: 60_000, enclosureBytes: 1234 };
    const row = { episodeId: 'e1', offsetMs: 42_000, finished: false, updatedAt: 1, progressSeq: 1, explicitSeek: false, syncedSeq: 0 };
    expect(toWatchEpisode(e, 'Show', row)).toEqual({ id: 'e1', title: 'T', show: 'Show', url: 'https://cdn/a.mp3', artworkUrl: 'https://img', positionMs: 42_000, durationMs: 60_000, bytes: 1234 });
    expect(toWatchEpisode({ id: 'e1', title: 'T', enclosureUrl: 'https://cdn/a.mp3' }, undefined, { ...row, finished: true }))
      .toEqual({ id: 'e1', title: 'T', show: '', url: 'https://cdn/a.mp3', positionMs: 0 });
  });
});

describe('modules/watch-link without and with a native side', () => {
  const ep = { id: 'e1', title: 'T', show: 'S', url: 'https://cdn/a.mp3', positionMs: 0 };

  it('no module (Jest, Android, an old build): no Watch, nothing sent, no positions, never a throw', () => {
    expect(watchState()).toEqual({ paired: false, installed: false });
    expect(sendEpisode(ep)).toBe(false);
    const fn = jest.fn();
    onPositions(fn)();
    expect(fn).not.toHaveBeenCalled();
    mockThrows = true;
    expect(watchState()).toEqual({ paired: false, installed: false });
    expect(sendEpisode(ep)).toBe(false);
  });

  it('with it: the state, a send without undefined fields, pending then live positions', () => {
    const sent: unknown[] = [];
    const remove = jest.fn();
    let live: (raw: unknown) => void = () => undefined;
    mockNative = {
      getState: () => ({ paired: true, installed: true }),
      sendEpisode: (e: unknown) => { sent.push(e); return true; },
      takePending: () => [at('a', 1, 1)],
      addListener: (_: string, fn: (raw: unknown) => void) => { live = fn; return { remove }; },
    };
    expect(watchState()).toEqual({ paired: true, installed: true });
    expect(sendEpisode({ ...ep, artworkUrl: undefined })).toBe(true);
    expect(sent).toEqual([ep]);
    const got: unknown[] = [];
    const off = onPositions((raw) => got.push(raw));
    live(at('b', 2, 2));
    expect(got).toEqual([at('a', 1, 1), at('b', 2, 2)]);
    off();
    expect(remove).toHaveBeenCalled();
  });

  it('installed is never true without paired, and a throwing call means "no Watch"', () => {
    mockNative = { getState: () => ({ paired: false, installed: true }) };
    expect(watchState()).toEqual({ paired: false, installed: false });
    mockNative = { getState: () => { throw new Error('inactive'); }, sendEpisode: () => { throw new Error('x'); } };
    expect(watchState()).toEqual({ paired: false, installed: false });
    expect(sendEpisode(ep)).toBe(false);
  });
});

it("the Watch's colours are the app's tokens (targets/watch/Theme.swift)", () => {
  const swift = readFileSync(join(__dirname, '..', 'targets', 'watch', 'Theme.swift'), 'utf8');
  const pairs = [...swift.matchAll(/\/\/ token: (\w+) (#[0-9a-f]{6})\n\s*static let (\w+) = Color\(hex: 0x([0-9A-F]{6})\)/g)];
  expect(pairs.length).toBeGreaterThanOrEqual(8);
  for (const [, token, commentHex, name, hex] of pairs) {
    expect(name).toBe(token);
    expect(commentHex).toBe((colour as Record<string, string>)[token!]);
    expect(`#${hex!.toLowerCase()}`).toBe((colour as Record<string, string>)[token!]);
  }
});
