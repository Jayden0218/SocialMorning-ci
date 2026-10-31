// The player's title block: the episode title, the show link, Follow, and the one status line.
/**
 * M31 T024 (design-pulse2 `player--screen`): low and reachable. The title is Unbounded 800 26/1.04;
 * under it "Morning Notes ›" (Geist 500 13/18, text2) opens the show; beside it a 34 ring pill
 * "Follow" subscribes (hidden once subscribed, as the old "+ Subscribe" was). Same names:
 * "Show: …" and "Subscribe to this show".
 *
 * Round 2: the block is bottom-anchored by the page (226 from the bottom); the title and "Follow" are 12 apart and
 * bottom-aligned (Follow's foot is the show line's foot — it had been 7 above it); the show link is the drawn
 * 18 tall line with a 48 tap area from `hitSlop`, not a 48 tall row that pushed the title up 15.
 *
 * The status line is the show line's tail, hot-text 13: "Buffering…", "Loading…", "Paused — your
 * headphones disconnected", "Playing a clip · 12:02–12:32 · pauses at the end", "Couldn't refresh
 * comments — showing the last copy", "Finished"; failing those, "N listening now" (M12 FR-042) —
 * the old top-bar chip, which has no place in the new top row. One line at most.
 */
import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Type } from '@/ui/kit/Type';
import { mmss } from '@/ui/kit/format';
import { selectHead, sameHead, selectIsPlaying, usePlayer, usePlayerSelector } from '@/playback/store';
import { useStores, useSubscriptionSync } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { liveLabel, useListeningNow } from '@/social/live';
import type { CachedEpisode, CachedShow } from '@/storage/types';
import { PLAYER } from './measures';

/** The show link is the drawn 18 tall line; its tap area is 48. */
const SHOW_SLOP = { top: 15, bottom: 15, left: 4, right: 12 };
const FOLLOW_SLOP = { top: 7, bottom: 7, left: 7, right: 7 };

/** The status words for what the player is doing, or undefined (pure — tested). */
export function statusLine(head: { kind: string; by: string | undefined; message?: string | undefined }, clip: { startMs: number; endMs: number } | undefined, stale: boolean, live: string | undefined): string | undefined {
  if (head.kind === 'error') return head.message;
  if (head.kind === 'ended') return 'Finished';
  if (head.kind === 'buffering') return 'Buffering…';
  if (head.kind === 'loading') return 'Loading…';
  if (head.kind === 'paused' && head.by === 'output-lost') return 'Paused — your headphones disconnected';
  if (clip) return `Playing a clip · ${mmss(clip.startMs)}–${mmss(clip.endMs)} · pauses at the end`;
  if (stale) return "Couldn't refresh comments — showing the last copy";
  return live;
}

function Status(props: { episodeId: string }): React.ReactElement | null {
  const player = usePlayer();
  const head = usePlayerSelector(selectHead, sameHead);
  const playing = usePlayerSelector(selectIsPlaying);
  const { useEpisodeSocial } = useSocial();
  const { stale } = useEpisodeSocial(props.episodeId);
  const live = liveLabel(useListeningNow(props.episodeId, playing));
  const text = statusLine(head, player.clip(), stale, live);
  if (text === undefined) return null;
  return <Type step="caption" className="text-hotText flex-shrink" numberOfLines={1} accessibilityLiveRegion="polite">{` · ${text}`}</Type>;
}

export function PlayerTitleBlock(props: { episodeId: string; episode: CachedEpisode | undefined; show: CachedShow | undefined }): React.ReactElement {
  const stores = useStores();
  const subscriptionSync = useSubscriptionSync();
  const [, setTick] = useState(0);
  const { episode, show } = props;
  // F10 (fontscale2 F2): at large text the title takes two lines and shrinks to fit, so it stays clear of the ring and the clock.
  const big = useWindowDimensions().fontScale > 1.3;
  const feedUrl = episode?.feedUrl;
  const subscribed = feedUrl !== undefined && stores.subscriptions.has(feedUrl);
  const subscribe = () => {
    if (feedUrl === undefined || subscribed) return;
    stores.subscriptions.add(feedUrl, Date.now());
    subscriptionSync.push();
    setTick((n) => n + 1);
  };
  return (
    <Box testID="player-title" className="flex-row items-end" style={{ gap: PLAYER.titleRowGap }}>
      <Box className="flex-1">
        <Type step="hero" className="text-text" style={{ fontSize: PLAYER.title, lineHeight: PLAYER.titleLine }} numberOfLines={big ? 2 : 3} adjustsFontSizeToFit={big} minimumFontScale={0.7}>{episode?.title ?? 'Now playing'}</Type>
        <Box className="flex-row items-center" style={{ marginTop: PLAYER.showGap, minHeight: PLAYER.showLine }}>
          {feedUrl === undefined ? (
            <Type step="caption" className="text-text2" numberOfLines={1}>{show?.title ?? ''}</Type>
          ) : (
            <Pressable onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(feedUrl) } })} accessibilityRole="link" accessibilityLabel={`Show: ${show?.title ?? ''}`} hitSlop={SHOW_SLOP} className="justify-center flex-shrink">
              <Type step="caption" className="text-text2" numberOfLines={1}>{`${show?.title ?? ''} ›`}</Type>
            </Pressable>
          )}
          <Status episodeId={props.episodeId} />
        </Box>
      </Box>
      {feedUrl === undefined || subscribed ? null : (
        <Pressable
          onPress={subscribe}
          accessibilityRole="button"
          accessibilityLabel="Subscribe to this show"
          hitSlop={FOLLOW_SLOP}
          className="rounded-pill items-center justify-center border-outline"
          style={{ height: PLAYER.follow, paddingHorizontal: PLAYER.followPad, borderWidth: PLAYER.outline }}
        >
          <Type step="row" className="text-text" style={{ fontSize: PLAYER.followText }} numberOfLines={1}>Follow</Type>
        </Pressable>
      )}
    </Box>
  );
}
