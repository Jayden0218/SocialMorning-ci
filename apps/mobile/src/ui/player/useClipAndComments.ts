// The two navigations the player makes from a moment: "Clip the last 30 seconds" and "Comments".
/**
 * M31 T024. Both read the position when the listener TAPS (`player.getState()`), not from a render,
 * so the page that offers them never re-renders per TICK (review C4). Used by the tray and the More sheet.
 *   - clip: signed out → the sign-in page; else the clip composer with the episode and the position.
 *   - comments (M12 FR-020): the conversation, whose write box carries this moment.
 */
import { useCallback } from 'react';
import { router } from 'expo-router';
import { playerPositionMs, usePlayer } from '@/playback/store';
import { useSocial } from '@/social/context';

export function useClip(episodeId: string | undefined): () => void {
  const player = usePlayer();
  const { listener } = useSocial();
  return useCallback(() => {
    if (episodeId === undefined) return;
    if (!listener) { router.push('/auth/sign-in'); return; }
    router.push({ pathname: '/clip/new', params: { episodeId, positionMs: String(playerPositionMs(player.getState())) } });
  }, [episodeId, listener, player]);
}

export function useOpenComments(episodeId: string | undefined): () => void {
  const player = usePlayer();
  return useCallback(() => {
    if (episodeId === undefined) return;
    router.push({ pathname: '/comments/[episodeId]', params: { episodeId, at: String(Math.round(playerPositionMs(player.getState()))) } });
  }, [episodeId, player]);
}
