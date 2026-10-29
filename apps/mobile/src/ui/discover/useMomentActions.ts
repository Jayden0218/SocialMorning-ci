// The buttons of a Moments card: play, sound, comments, react, share.
/**
 * M31 T025. Each action works from the card's moment. The actions that cost data or take the audio
 * (sound, Play) run only from a tap. Sound plays the moment through the main player in clip mode
 * (`playClip`: seek to the start, pause at the end) — so the main player always wins over another
 * stream (research rule 3), a call or another app is handled by the player as for any episode, and
 * no second audio session exists. If the main player is playing something else, the first tap asks
 * "Switch to this moment?" (`pendingSwitch`, drawn by the feed as a Dialog).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import type { Discover } from '@/social/api';
import { useSocial } from '@/social/context';
import { usePlayer } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { refreshShow } from '@/feeds/fetch';
import { mayStreamNow } from '@/settings/playback';
import { createExpoNetwork } from '@/downloads/expo-network';
import { askMobileData } from '@/ui/player/DataPrompt';
import { useStores, useToast } from '@/ui/shell/providers';
import { useExploreApi } from '@/discover/explore-api';
import type { Moment } from '@/discover/moments-api';
import { cardsOf, ensureLocal, reactAt, reasonText } from './moment-actions';
import { previewRange, soundTapPlan } from './moments-logic';

export type MomentActions = {
  /** Play the episode from the moment and open the player. */
  playFull: (m: Moment) => void;
  /** The sound pill. */
  toggleSound: (m: Moment, soundOn: boolean) => void;
  /** Stop the sound this card started (leaving the card, the tab or the app). */
  stopSound: (m: Moment) => void;
  comments: (m: Moment) => void;
  /** Flame: react at the moment. Resolves to the new state, or undefined when it did not happen. */
  react: (m: Moment, durationMs: number | undefined) => Promise<boolean | undefined>;
  share: (m: Moment) => void;
  /** Set while "Switch to this moment?" is asked. */
  pendingSwitch: Moment | undefined;
  confirmSwitch: () => void;
  cancelSwitch: () => void;
};

export function useMomentActions(body: Discover | undefined): MomentActions {
  const stores = useStores();
  const toast = useToast();
  const player = usePlayer();
  const { api, listener } = useSocial();
  const explore = useExploreApi();
  const network = useMemo(() => createExpoNetwork(), []);
  const [pendingSwitch, setPendingSwitch] = useState<Moment | undefined>(undefined);
  const busy = useRef(false);
  const chart = useRef<Promise<Map<string, import('@/social/api').EpisodeCard>> | undefined>(undefined);
  const known = useMemo(() => cardsOf(body), [body]);

  const ensure = useCallback(async (m: Moment): Promise<boolean> => {
    const r = await ensureLocal({
      stores,
      refreshShow: (u) => refreshShow(u, stores.feeds, Date.now()),
      card: async (id) => {
        const c = known.get(id);
        if (c) return c;
        chart.current ??= explore.chart('talked', 50).then((p) => new Map(p.items.map((i) => [i.episode.id, i.episode] as const)));
        return (await chart.current).get(id);
      },
    }, m.episodeId, m.feedUrl);
    if (!r.ok) toast(reasonText(r.reason));
    return r.ok;
  }, [stores, toast, known, explore]);

  /** Runs `fn` once at a time: a second tap while the first is fetching the show does nothing. */
  const once = useCallback((fn: () => Promise<void>): void => {
    if (busy.current) return;
    busy.current = true;
    void fn().finally(() => { busy.current = false; });
  }, []);

  const startSound = useCallback(async (m: Moment): Promise<void> => {
    if (!(await ensure(m))) return;
    const p = toPlayable(stores, m.episodeId);
    if (!p) { toast(reasonText('missing')); return; }
    const go = (): void => player.playClip(p, previewRange(m));
    // A stream on mobile data asks first, and only from this tap (research rule 4).
    if (/^https?:/i.test(p.url) && !mayStreamNow(stores.settings, await network.kind())) {
      if (!askMobileData({ retry: go })) toast('Not downloaded, and playing on mobile data is off. Use Wi-Fi, download it, or allow mobile data in Settings › More.');
      return;
    }
    go();
  }, [ensure, stores, toast, player, network]);

  const otherPlaying = (m: Moment): boolean => {
    const s = player.getState();
    if (s.kind !== 'playing' && s.kind !== 'buffering') return false;
    const c = player.clip();
    return !(c !== undefined && c.episodeId === m.episodeId && c.startMs === m.startMs);
  };

  return {
    playFull: (m) => once(async () => {
      if (!(await ensure(m))) return;
      const p = toPlayable(stores, m.episodeId);
      if (!p) { toast(reasonText('missing')); return; }
      const s = player.getState();
      if (s.kind !== 'idle' && 'episodeId' in s && s.episodeId === m.episodeId) { player.seek(m.startMs); player.play(); } else { player.load(p, 'play'); player.seek(m.startMs); }
      router.push('/player');
    }),
    toggleSound: (m, soundOn) => {
      const plan = soundTapPlan({ soundOn, otherPlaying: otherPlaying(m) });
      if (plan === 'stop') { player.pause(); return; }
      if (plan === 'confirm-switch') { setPendingSwitch(m); return; }
      once(() => startSound(m));
    },
    stopSound: (m) => {
      const c = player.clip();
      const s = player.getState();
      if (c !== undefined && c.episodeId === m.episodeId && c.startMs === m.startMs && (s.kind === 'playing' || s.kind === 'buffering')) player.pause();
    },
    comments: (m) => router.push({ pathname: '/comments/[episodeId]', params: { episodeId: m.episodeId, at: String(m.startMs) } }),
    react: async (m, durationMs) => {
      if (!listener) { router.push('/auth/sign-in'); return undefined; }
      try {
        let duration = durationMs;
        if (duration === undefined) {
          const s = await api.social(m.episodeId);
          duration = s.status === 200 ? (s.body.episode.durationMs ?? undefined) : undefined;
        }
        if (duration === undefined) { toast("Couldn't react just now — try again."); return undefined; }
        return (await api.react(m.episodeId, reactAt(m), duration)).reacted;
      } catch {
        toast("Couldn't react just now — try again.");
        return undefined;
      }
    },
    share: (m) => {
      if (!listener) { router.push('/auth/sign-in'); return; }
      once(async () => {
        if (!(await ensure(m))) return;
        router.push({ pathname: '/clip/new', params: { episodeId: m.episodeId, startMs: String(m.startMs), endMs: String(m.endMs), positionMs: String(m.endMs) } });
      });
    },
    pendingSwitch,
    confirmSwitch: () => { const m = pendingSwitch; setPendingSwitch(undefined); if (m) once(() => startSound(m)); },
    cancelSwitch: () => setPendingSwitch(undefined),
  };
}
