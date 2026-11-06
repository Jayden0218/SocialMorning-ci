// Spec 039 Q3 (owner, 2026-11-06): Me's "Continue listening" shows the loaded episode, else the last one played (kept on the device), else nothing.
/**
 * Written BEFORE the change (red): (a) nothing loaded and a stored last episode: the card shows its title, show and time left; (b) tapping it
 * has the player load that episode and start it from the stored position; (c) nothing stored and nothing loaded: no card. The writer
 * (`rememberLastPlayed`) is tested in src/me/__tests__/last-played.test.ts. Break to watch red: read the player only (drop the stored
 * fallback) and (a) and (b) go red; draw the card whenever a stored episode exists, even while another is loaded, and the "loaded wins" test goes red.
 */
import { createElement } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createMemoryStores } from '@/storage/memory';
import type { Stores } from '@/storage/types';
import { rememberLastPlayed } from '@/me/last-played';

const mockPush = jest.fn();
const mockLoad = jest.fn();
let mockStores: Stores;
let mockHead: { episodeId: string | undefined } = { episodeId: undefined };
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores }));
jest.mock('@/playback/store', () => ({
  ...jest.requireActual('@/playback/store'),
  usePlayer: () => ({ load: (...a: unknown[]) => mockLoad(...a) }),
  usePlayerSelector: (sel: unknown) => (sel === jest.requireActual('@/playback/store').selectHead ? mockHead : undefined),
}));

import { ContinueCard } from '@/ui/me/ContinueCard';

const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((x) => x.unmount()); }); mockPush.mockClear(); mockLoad.mockClear(); mockHead = { episodeId: undefined }; });
function draw(): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(ContinueCard)); });
  mounted.push(r);
  return r;
}
const words = (r: ReactTestRenderer): string => r.root.findAll((n) => (n.type as unknown) === Text).map((x) => [x.props['children']].flat(5).join('')).join('|');
const STORED = { episodeId: 'e7', offsetMs: 600_000, durationMsAtSave: 1_800_000, finished: false, updatedAt: 1, progressSeq: 1, explicitSeek: false, syncedSeq: 0 };

beforeEach(() => { mockStores = createMemoryStores((s) => s); });

describe('Me: Continue listening', () => {
  it('(a) shows the last played episode from the device when nothing is loaded', () => {
    rememberLastPlayed(mockStores, STORED, { id: 'e7', title: 'The seventh', showTitle: 'Morning Show', url: 'https://a/e7.mp3', artworkUrl: 'https://i/e7.jpg' });
    const r = draw();
    expect(words(r)).toContain('The seventh');
    expect(words(r)).toContain('Morning Show');
    expect(words(r)).toContain('20:00 left');
    expect(r.root.findAll((n) => n.props['testID'] === 'continue-progress' && typeof n.type === 'string')).toHaveLength(1);
  });

  it('(b) tapping it has the player load that episode and start from the stored position', () => {
    rememberLastPlayed(mockStores, STORED, { id: 'e7', title: 'The seventh', showTitle: 'Morning Show', url: 'https://a/e7.mp3' });
    const r = draw();
    const card = r.root.findAll((n) => typeof n.props['onPress'] === 'function' && String(n.props['accessibilityLabel']).startsWith('Continue listening'))[0]!;
    act(() => { card.props['onPress'](); });
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(mockLoad.mock.calls[0]![0]).toMatchObject({ id: 'e7', url: 'https://a/e7.mp3', title: 'The seventh', showTitle: 'Morning Show' });
    expect(mockLoad.mock.calls[0]![1]).toBe('play');
    // The player starts an episode from its saved position (`startPositionFor`), so that row holds the stored place.
    expect(mockStores.positions.get('e7')?.offsetMs).toBe(600_000);
    expect(mockPush).toHaveBeenCalledWith('/player');
  });

  it('(c) draws nothing when nothing is stored and nothing is loaded', () => {
    const r = draw();
    expect(r.toJSON()).toBeNull();
  });

  it('draws nothing for a stored value that is not an episode (a damaged setting)', () => {
    mockStores.settings.set('me.lastPlayed', '{not json');
    expect(draw().toJSON()).toBeNull();
  });

  it('a loaded episode wins over the stored one', () => {
    rememberLastPlayed(mockStores, STORED, { id: 'e7', title: 'The seventh', showTitle: 'Morning Show', url: 'https://a/e7.mp3' });
    mockHead = { episodeId: 'e9' }; // not in the feed cache: the loaded path draws "an episode"
    mockStores.feeds.getEpisode = (() => undefined) as never;
    const r = draw();
    expect(words(r)).not.toContain('The seventh');
  });
});
