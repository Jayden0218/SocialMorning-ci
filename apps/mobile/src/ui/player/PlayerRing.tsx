// The player's ring: the reaction curve wrapped round the cover; drag to seek, avatar pins mark comments.
/**
 * M31 T024 (design-pulse2 `player--screen`, "Layout: Ring"). The cover is a circle (0.62 of the ring) in
 * the middle of a 330 ring of 100 spokes — the heat curve; played spokes run hot → violet from
 * 12 o'clock, clockwise (kit `Ring`). Seek by turning the knob or tapping a spoke; to a screen reader
 * the ring is ONE adjustable control named "Seek" (value "14:32 of 34:17", swipe up/down = ±15 s),
 * the same name and value `Scrubber` and `HeatScrubber` had (guard G11), and the same +30 / −15 steps. A time bubble over the
 * cover reads "12:32 · −35:38" and follows a finger that is dragging.
 *
 * Avatar pins (18) sit on the rim where people commented today (the old Rail's markers, same labels:
 * "Comment at 0:30 by …"); a tap seeks there and opens the moment (`onOpenMarker`).
 *
 * Double-tap the cover to react at this moment (the tray's heart does the same; both through
 * `useReaction`). A video episode shows its picture in the circle, muted, following the audio.
 *
 * This leaf — not the page — reads the clock (rounded to the second) and the heat, so a position
 * TICK redraws only the ring (review C4, T024's render-count guard).
 */
import { useRef, useState } from 'react';
import { mediaKindOf } from '@socialmorning/social-core';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { Ring, type RingPin } from '@/ui/kit/RingScrubber';
import { Artwork } from '@/ui/kit/Artwork';
import { Type } from '@/ui/kit/Type';
import { mmss } from '@/ui/kit/format';
import { playerPositionMs, sameClock, selectClock, usePlayer, usePlayerSelector, selectIsPlaying } from '@/playback/store';
import { useSocial } from '@/social/context';
import type { CachedEpisode, CachedShow } from '@/storage/types';
import { heatMessage } from './HeatCurve';
import { alignHeat } from './hot';
import { PLAYER } from './measures';
import { markerLabel, railMarkers, type RailMarker } from './Rail';
import { scrubberValue } from './Scrubber';
import { VideoStage } from './VideoStage';
import { useReaction } from './useReaction';

const PIN_COLOURS = [colour.pinGreen, colour.pinBlue, colour.violet, colour.hot] as const;

/** A pin's colour from the first commenter's name, so the same person keeps one colour. */
export function pinColour(name: string | null | undefined): string {
  let h = 0;
  for (const ch of name ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PIN_COLOURS[h % PIN_COLOURS.length]!;
}

const TWICE_MS = 320;
/** A touch that moves further than this is a drag (the ring's), not a tap. */
const TAP_SLOP = 10;

/** The picture of a video episode, following the audio (needs the exact position, so it reads every TICK itself). */
function VideoCover(props: { url: string; size: number }): React.ReactElement {
  const positionMs = usePlayerSelector(playerPositionMs);
  const playing = usePlayerSelector(selectIsPlaying);
  return <VideoStage url={props.url} positionMs={positionMs} playing={playing} size={props.size} />;
}

export function PlayerRing(props: {
  episodeId: string;
  episode: CachedEpisode | undefined;
  show: CachedShow | undefined;
  /** The ring's size: `playerLayout(...).ring` — 330 on the drawing's phone. */
  size: number;
  onOpenMarker: (marker: RailMarker) => void;
}): React.ReactElement {
  const player = usePlayer();
  const size = props.size;
  const { useEpisodeSocial } = useSocial();
  const { cached } = useEpisodeSocial(props.episodeId);
  const { toggle } = useReaction(props.episodeId);
  const clock = usePlayerSelector(selectClock, sameClock);
  const [drag, setDrag] = useState<number | undefined>();
  const lastTap = useRef(0);
  const downAt = useRef<{ x: number; y: number } | undefined>(undefined);
  const { episode, show } = props;

  const durationMs = clock.durationMs ?? episode?.durationMs;
  const heatAxisMs = cached?.social.episode.durationMs ?? durationMs;
  const heat = cached?.social.heat;
  const buckets = alignHeat(heat?.available ? heat.buckets : undefined, heatAxisMs, durationMs);
  const fraction = durationMs ? Math.min(1, Math.max(0, clock.positionMs / durationMs)) : 0;
  const shown = drag ?? fraction;
  const shownMs = durationMs ? Math.round(shown * durationMs) : clock.positionMs;
  const usable = durationMs !== undefined && durationMs > 0;
  const markers = railMarkers(cached?.social.comments ?? []);
  const pins: RingPin[] = !usable ? [] : markers.map((m) => ({
    at: Math.min(1, m.offsetMs / durationMs!),
    colour: pinColour(m.comments[0]?.displayName),
    label: markerLabel(m),
    onPress: () => { player.seek(m.offsetMs); props.onOpenMarker(m); },
  }));
  const seekTo = (f: number) => { if (usable) player.seek(Math.round(f * durationMs!)); };
  const hint = heatMessage(heat);
  const valueText = `${scrubberValue(clock.positionMs, durationMs).text}${hint ? `. ${hint}` : ''}`;
  const d = Math.round(size * PLAYER.inner);
  const artworkUrl = episode?.imageUrl ?? show?.imageUrl;
  const video = episode !== undefined && mediaKindOf(episode.enclosureType, episode.enclosureUrl) === 'video';
  // A tap is a touch that did not travel; two within TWICE_MS react.
  const onCover = (x: number, y: number) => {
    const from = downAt.current;
    if (from && Math.hypot(x - from.x, y - from.y) > TAP_SLOP) { lastTap.current = 0; return; }
    const now = Date.now();
    if (now - lastTap.current < TWICE_MS) { lastTap.current = 0; toggle(); } else lastTap.current = now;
  };
  return (
    <Box className="items-center justify-center" style={{ width: size, height: size }}>
      <Ring
        size={size}
        inner={PLAYER.inner}
        heat={buckets}
        progress={shown}
        pins={pins}
        label="Seek"
        glowColour={PLAYER.coverGlow}
        valueText={valueText}
        {...(usable ? { onSeek: (f: number) => setDrag(f), onSeekEnd: (f: number) => { setDrag(undefined); seekTo(f); } } : {})}
        onStep={(dir) => player.skip(dir === 1 ? 30_000 : -15_000)}
      >
        {video && episode ? (
          <VideoCover url={episode.enclosureUrl} size={d} />
        ) : (
          // Double-tap reacts. Not a button to a screen reader (the tray's heart is the accessible way), and
          // not a Pressable either: it listens to the touch itself, so the ring's drag still owns the gesture.
          <Box onTouchStart={(e) => { downAt.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }; }} onTouchEnd={(e) => onCover(e.nativeEvent.pageX, e.nativeEvent.pageY)} accessible={false} className="items-center justify-center" style={{ width: d, height: d }}>
            <Artwork url={artworkUrl} size={d} name={show?.title} rounded="pill" />
          </Box>
        )}
      </Ring>
      {/* The time bubble: "12:32 · −35:38". Decoration — the ring's value says the same. */}
      <Box testID="player-bubble" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" className="absolute self-center" style={{ top: size / 2 + PLAYER.bubbleBelowCentre, backgroundColor: PLAYER.bubbleFill, borderRadius: PLAYER.bubbleRadius, paddingHorizontal: PLAYER.bubblePadX, paddingVertical: PLAYER.bubblePadY }}>
        <Type step="mono" className="text-text" style={{ lineHeight: PLAYER.bubbleLine }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {durationMs === undefined ? mmss(shownMs) : `${mmss(shownMs)} · −${mmss(Math.max(0, durationMs - shownMs))}`}
        </Type>
      </Box>
    </Box>
  );
}
