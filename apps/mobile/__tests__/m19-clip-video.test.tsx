// Tests "Share as video": when the row shows, what it hands the native module, and the 60 s limit.
/**
 * M19 (owner, 2026-10-05: share a clip as a video, made with the phone's own encoders).
 *  - `useClipVideoRows` offers "Share as video" only when the `ClipVideo` module is in the build
 *    and the clip is 1 ms … 60 s long;
 *  - a tap on a downloaded episode hands the local file, the range, the cover and the clip's
 *    heat to `makeClipVideo`, then shares the file it made;
 *  - `modules/clip-video` itself refuses an empty or over-60 s clip, and a build with no native
 *    module, before anything native runs.
 *
 * The break that turns it red: in src/ui/clips/ShareChooser.tsx drop
 * `|| length > ClipVideo.MAX_CLIP_VIDEO_MS` (the over-60 s test fails).
 */
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { PlayableEpisode } from '@/playback/store';
import type { ShareOption } from '@/ui/clips/ShareChooser';

const mockToast = jest.fn();
const mockCache = { get: jest.fn() };

jest.mock('../modules/clip-video', () => ({
  MAX_CLIP_VIDEO_MS: 60_000,
  isAvailable: jest.fn(() => true),
  makeClipVideo: jest.fn(async () => ({ uri: 'file:///cache/clip-1.mp4' })),
  shareVideo: jest.fn(async () => undefined),
}));
jest.mock('@/ui/shell/providers', () => ({
  useToast: () => mockToast,
  useStores: () => ({ settings: { get: () => undefined } }),
}));
jest.mock('@/social/context', () => ({ useSocial: () => ({ cache: mockCache }) }));
jest.mock('@/social/m12-api', () => ({ useM12Api: () => ({}) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-file-system', () => ({
  File: class { exists = false; uri = 'file:///cache/x'; delete(): void {} static downloadFileAsync = jest.fn() },
  Directory: class { exists = true; create(): void {} },
  DownloadTask: class {},
  Paths: { cache: 'file:///cache', document: 'file:///docs' },
}));

import * as clipVideo from '../modules/clip-video';
import { clipVideoHeat, useClipVideoRows } from '@/ui/clips/ShareChooser';

const native = clipVideo as unknown as { isAvailable: jest.Mock; makeClipVideo: jest.Mock; shareVideo: jest.Mock };

const episode: PlayableEpisode = {
  id: 'e1',
  url: 'file:///docs/downloads/e1.mp3',
  title: 'Casey Wants to Believe',
  showTitle: 'The Show',
  artworkUrl: 'https://img.example/cover.jpg',
  durationMs: 100_000,
};

function rowsFor(clip: { startMs: number; endMs: number }, ep: PlayableEpisode = episode): ShareOption[] {
  let rows: ShareOption[] = [];
  function Probe(): null {
    const make = useClipVideoRows();
    rows = make(clip, ep);
    return null;
  }
  act(() => { create(createElement(Probe)); });
  return rows;
}

beforeEach(() => {
  jest.clearAllMocks();
  native.isAvailable.mockReturnValue(true);
  mockCache.get.mockReturnValue(undefined);
});

describe('the "Share as video" row', () => {
  it('shows for a clip of up to 60 s when the module is in the build', () => {
    expect(rowsFor({ startMs: 10_000, endMs: 40_000 }).map((r) => r.label)).toEqual(['Share as video']);
    expect(rowsFor({ startMs: 0, endMs: 60_000 }).map((r) => r.label)).toEqual(['Share as video']);
  });

  it('is hidden when the build has no ClipVideo module', () => {
    native.isAvailable.mockReturnValue(false);
    expect(rowsFor({ startMs: 10_000, endMs: 40_000 })).toEqual([]);
  });

  it('is hidden for a clip over 60 s, and for an empty one', () => {
    expect(rowsFor({ startMs: 0, endMs: 60_001 })).toEqual([]);
    expect(rowsFor({ startMs: 5_000, endMs: 5_000 })).toEqual([]);
  });

  it('a tap makes the video from the downloaded file and shares it', async () => {
    mockCache.get.mockReturnValue({ social: { episode: { id: 'e1', durationMs: 100_000 }, heat: { available: true, buckets: Array.from({ length: 100 }, (_, i) => i) } }, fetchedAt: 0 });
    const [row] = rowsFor({ startMs: 10_000, endMs: 40_000 });
    await act(async () => {
      row!.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(native.makeClipVideo).toHaveBeenCalledTimes(1);
    const options = native.makeClipVideo.mock.calls[0]![0];
    expect(options).toEqual(expect.objectContaining({
      audioUri: 'file:///docs/downloads/e1.mp3',
      startMs: 10_000,
      endMs: 40_000,
      coverUri: 'https://img.example/cover.jpg',
      title: 'Casey Wants to Believe',
      show: 'The Show',
    }));
    expect(options.heat).toHaveLength(30);
    expect(options.heat[0]).toBe(10); // the bucket at 10.5 s of a 100 s episode
    expect(native.shareVideo).toHaveBeenCalledWith('file:///cache/clip-1.mp4', 'Casey Wants to Believe');
    expect(mockToast).toHaveBeenCalledWith('Making the video…');
    expect(mockToast).not.toHaveBeenCalledWith('Downloading the episode…');
  });

  it('a failure is a toast, not a crash', async () => {
    native.makeClipVideo.mockRejectedValueOnce(new Error('encoder'));
    const [row] = rowsFor({ startMs: 10_000, endMs: 40_000 });
    await act(async () => {
      row!.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(native.shareVideo).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenLastCalledWith("Couldn't make the video — try again when you're online.");
  });
});

describe('clipVideoHeat', () => {
  it('samples the episode curve across the clip, and is empty without a curve', () => {
    const buckets = Array.from({ length: 100 }, (_, i) => i);
    expect(clipVideoHeat(buckets, 100_000, 0, 100_000, 4)).toEqual([12, 37, 62, 87]);
    expect(clipVideoHeat(undefined, 100_000, 0, 1_000)).toEqual([]);
    expect(clipVideoHeat(buckets, undefined, 0, 1_000)).toEqual([]);
  });
});

describe('modules/clip-video', () => {
  const load = (nativeModule: unknown) => {
    let mod!: typeof import('../modules/clip-video');
    jest.isolateModules(() => {
      jest.doMock('expo', () => ({ requireOptionalNativeModule: () => nativeModule }));
      mod = jest.requireActual('../modules/clip-video');
    });
    return mod;
  };
  const base = { audioUri: 'file:///a.mp3', title: 't', show: 's', heat: [] };

  it('refuses a clip over 60 s or of no length before calling the native side', async () => {
    const fake = { makeClipVideo: jest.fn(async () => ({ uri: 'file:///v.mp4' })), shareVideo: jest.fn() };
    const mod = load(fake);
    await expect(mod.makeClipVideo({ ...base, startMs: 0, endMs: 60_001 })).rejects.toThrow('at most 60 seconds');
    await expect(mod.makeClipVideo({ ...base, startMs: 5_000, endMs: 5_000 })).rejects.toThrow('no length');
    expect(fake.makeClipVideo).not.toHaveBeenCalled();
    await expect(mod.makeClipVideo({ ...base, startMs: 0, endMs: 60_000 })).resolves.toEqual({ uri: 'file:///v.mp4' });
    expect(mod.isAvailable()).toBe(true);
  });

  it('with no native module: not available, and making a video rejects', async () => {
    const mod = load(null);
    expect(mod.isAvailable()).toBe(false);
    await expect(mod.makeClipVideo({ ...base, startMs: 0, endMs: 1_000 })).rejects.toThrow('cannot make videos');
    await expect(mod.shareVideo('file:///v.mp4', 't')).rejects.toThrow('cannot share videos');
  });
});
