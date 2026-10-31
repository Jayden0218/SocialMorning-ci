// The episode's playhead in whole seconds, for the few parts of the comments page that follow it.
/**
 * M23 US7 (kept): only the small parts that show the moment re-render, once per whole second — never the comment list.
 * `undefined` = this episode is not loaded in the player (the page then falls back to where the phone last left it).
 */
import { episodePlayView, usePlayerSelector } from '@/playback/store';

export function usePlayheadMs(episodeId: string | undefined): number | undefined {
  const sec = usePlayerSelector((s) => {
    const v = episodePlayView(s, episodeId);
    return !v.loaded ? -2 : 'positionMs' in s && typeof s.positionMs === 'number' ? Math.floor(s.positionMs / 1000) : -1;
  });
  return sec >= 0 ? sec * 1000 : undefined;
}
