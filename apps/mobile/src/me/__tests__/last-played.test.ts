// Spec 039 Q3: the last played episode is kept on the device as the player saves its position, and when an episode ends.
import { createMemoryStores } from '@/storage/memory';
import { readLastPlayed, rememberLastPlayed } from '@/me/last-played';

const row = (over: Record<string, unknown> = {}) => ({ episodeId: 'e1', offsetMs: 5_000, durationMsAtSave: 60_000, finished: false, updatedAt: 1, progressSeq: 1, explicitSeek: false, syncedSeq: 0, ...over }) as never;
const stores = () => createMemoryStores((s) => s);

describe('last played on the device', () => {
  it('nothing stored reads as undefined', () => {
    expect(readLastPlayed(stores().settings)).toBeUndefined();
  });

  it('keeps id, title, show, cover, position and length from the position save and the episode', () => {
    const s = stores();
    rememberLastPlayed(s, row(), { id: 'e1', title: 'T', showTitle: 'S', url: 'https://a/1.mp3', artworkUrl: 'https://i/1.jpg' });
    expect(readLastPlayed(s.settings)).toMatchObject({ id: 'e1', title: 'T', showTitle: 'S', artworkUrl: 'https://i/1.jpg', positionMs: 5_000, durationMs: 60_000, finished: false });
  });

  it('a later save of another episode replaces it; an end marks it finished', () => {
    const s = stores();
    rememberLastPlayed(s, row(), { id: 'e1', title: 'T', showTitle: 'S', url: 'u' });
    rememberLastPlayed(s, row({ episodeId: 'e2', offsetMs: 60_000, finished: true }), { id: 'e2', title: 'T2', showTitle: 'S', url: 'u2' });
    expect(readLastPlayed(s.settings)).toMatchObject({ id: 'e2', positionMs: 60_000, finished: true });
  });

  it('a damaged value reads as undefined, never throws', () => {
    const s = stores();
    s.settings.set('me.lastPlayed', '{"id":5}');
    expect(readLastPlayed(s.settings)).toBeUndefined();
  });
});
