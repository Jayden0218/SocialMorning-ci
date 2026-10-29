// Everything the player page decides: which page to draw, which sheet is open, the episode, and closing.
/**
 * M31 T024 (review D7: the 620-line page is split into section components and this hook; review C4:
 * `usePlayerSelector`, never `usePlayerState`). The page — `app/player.tsx` — reads only what it must
 * to choose a layout: the HEAD of the player state (its kind, the episode, a failure's message), never
 * the position. Every part that draws the position, the heat, the comments or the speed is its own
 * component with its own subscription (PlayerRing, TransportRow, PlayerTray, PlayerTitleBlock …), so
 * ten seconds of playback re-render the page at most once (`__tests__/player-render-count.test.tsx`,
 * guard G-M31-PLAYER-RENDERS reads `renderProbe`).
 *
 * What lives here: the open sheet (one at a time), the pin or line being looked at, the loop and skip
 * silence switches of the Playback sheet, closing, and the swipe-down that closes.
 */
import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import type { TranscriptLine } from '@socialmorning/player-core';
import { sameHead, selectHead, usePlayer, usePlayerSelector, type PlayerHead } from '@/playback/store';
import { getPref, setPref } from '@/settings/prefs';
import { useEffectsBlocked } from '@/ui/settings/AudioRows';
import { useStores } from '@/ui/shell/providers';
import type { CachedEpisode, CachedShow } from '@/storage/types';
import { episodeAndShow } from './lookup';
import type { RailMarker } from './Rail';
import { useSwipeDownToClose } from './swipe-close';
import { useEpisodeExtras } from './useEpisodeExtras';

/** Test hook: how many times the page's hook ran (= how many times the page rendered). */
export const renderProbe = { count: 0 };

export type PlayerSheetName = 'none' | 'more' | 'transcript' | 'playback' | 'share';

export function usePlayerScreen() {
  renderProbe.count += 1;
  const player = usePlayer();
  const stores = useStores();
  const head: PlayerHead = usePlayerSelector(selectHead, sameHead);
  const episodeId = head.episodeId;
  const { episode, show }: { episode: CachedEpisode | undefined; show: CachedShow | undefined } = episodeId ? episodeAndShow(stores.feeds, episodeId) : { episode: undefined, show: undefined };
  const extras = useEpisodeExtras(episodeId);
  const [sheet, setSheet] = useState<PlayerSheetName>('none');
  const [marker, setMarker] = useState<RailMarker | undefined>();
  const [reporting, setReporting] = useState<TranscriptLine | undefined>();
  // M21 US2: skip silence, kept in prefs (src/settings/prefs.ts) and applied at start-up (providers).
  const [skipSilence, setSkipSilenceOn] = useState(() => getPref(stores.settings, 'skipSilence'));
  // M21 US11: iPhone + an HLS episode → no audio tap, so skip silence and voice boost are greyed out.
  const effectsBlocked = useEffectsBlocked();
  // M19 T070 (US7, research R2): "Loop this episode" — the runtime turns it off on any load.
  const [looping, setLooping] = useState(() => player.loop());
  useEffect(() => { setLooping(player.loop()); }, [player, episodeId]);
  // A new episode closes whatever was open about the last one.
  useEffect(() => { setSheet('none'); setMarker(undefined); }, [episodeId]);
  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/')), []);
  const swipeDown = useSwipeDownToClose(close);
  return {
    head,
    episodeId,
    episode,
    show,
    extras,
    sheet,
    open: (name: PlayerSheetName) => setSheet(name),
    closeSheet: () => setSheet('none'),
    marker,
    setMarker,
    reporting,
    setReporting,
    close,
    swipeDown,
    looping,
    setLoop: (v: boolean) => { player.setLoop(v); setLooping(v); },
    skipSilence,
    setSkipSilence: (v: boolean) => { setPref(stores.settings, 'skipSilence', v); player.setSkipSilence(v); setSkipSilenceOn(v); },
    effectsBlocked,
  };
}
