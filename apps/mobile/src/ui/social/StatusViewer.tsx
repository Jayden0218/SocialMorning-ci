// Full-screen status viewer: plays on open, taps on the right or left third move, swipe down closes.
/**
 * M22 US2 (FR-006, T021) and US6 (FR-020, T026). One status at a time, in the order of the
 * Updates row (people I follow, then "Suggested"):
 *  - a voice status plays as soon as it is shown; a text status shows its words large;
 *  - a tap on the right third goes to the next status (and so the next person), the left third
 *    goes back, the middle third stops or plays again; past the last one the viewer closes;
 *  - a swipe down on the status closes the viewer (and the screen reader has "Close" in the
 *    page's own header — no native sheet, constitution v3);
 *  - under it: its items (episode cards open the episode, ▶ plays it; photos full width), then
 *    the replies and reactions (StatusReplies).
 *  - M24 US1/US17: someone else's status has a "More" button (Report; on a suggested one, "Stop
 *    suggesting"); the page owns the sheet, the viewer only asks for it.
 * The swipe uses React Native's PanResponder, like src/ui/kit/Sheet.tsx: Jest has no
 * gesture-handler mocks and this one gesture needs nothing more.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder } from 'react-native';
import { router } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Image } from '@/ui/lib/image';
import { playVoice } from '@/playback/expo-audio-adapter';
import { Avatar } from '@/ui/kit/Avatar';
import { Artwork } from '@/ui/kit/Artwork';
import { Card, CardDivider } from '@/ui/kit/Card';
import { Icon } from '@/ui/kit/Icon';
import { hit } from '@/design';
import { mmss } from '@/ui/kit/format';
import { hoursLeft } from '@/social/voice';
import { stepStatus, type Status, type StatusItem } from '@/social/api-m22-social';
import { StatusReplies } from './StatusReplies';

const STAGE = { minHeight: 280 };
const TAP = { minHeight: hit.min };
const DISC = { width: 120, height: 120 };
const PHOTO = { width: '100%' as const, aspectRatio: 4 / 3, borderRadius: 16 };
/** A downward drag longer than this closes the viewer. */
const CLOSE_DY = 80;

export type Colours = { accent: string; muted: string; text: string; onPrimary: string };

/** One item on a status: an episode card (opens the episode; ▶ plays it) or a photo. */
export function StatusItemCard(props: { item: StatusItem; colours: Colours; onPlay?: (episodeId: string) => void }): React.ReactElement {
  const it = props.item;
  if (it.kind === 'photo') return <Image source={{ uri: it.url }} style={PHOTO} accessibilityLabel="A photo on this status" />;
  return (
    <Box className="flex-row items-center gap-row py-row">
      <Pressable
        onPress={() => router.push({ pathname: '/episode/[id]', params: { id: it.episodeId } })}
        accessibilityRole="link"
        accessibilityLabel={`Episode: ${it.title ?? 'an episode'}${it.showTitle ? `, ${it.showTitle}` : ''}`}
        className="flex-1 flex-row items-center gap-row"
        style={TAP}
      >
        <Artwork url={it.imageUrl ?? null} size={48} name={it.showTitle ?? it.title ?? ''} />
        <Box className="flex-1">
          <Text className="text-text text-body font-semibold" numberOfLines={2}>{it.title ?? 'Episode'}</Text>
          {it.showTitle ? <Text className="text-muted text-xs" numberOfLines={1}>{it.showTitle}</Text> : null}
        </Box>
      </Pressable>
      {props.onPlay ? (
        <Pressable onPress={() => props.onPlay?.(it.episodeId)} accessibilityRole="button" accessibilityLabel={`Play ${it.title ?? 'this episode'}`} className="rounded-pill bg-playDisc items-center justify-center" style={{ width: hit.min, height: hit.min }}>
          <Icon name="play" size={18} color={props.colours.accent} />
        </Pressable>
      ) : null}
    </Box>
  );
}

export function StatusViewer(props: {
  statuses: Status[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** Pauses the episode (a status plays over it, never with it). */
  pauseEpisode: () => void;
  /** Plays an episode card's episode. */
  playEpisode: (episodeId: string) => void;
  /** Reload after a reaction (counts). */
  reload: () => void;
  colours: Colours;
  /** M24: someone else's status → the page's More sheet (Report, Stop suggesting). */
  onMore?: (s: Status) => void;
}): React.ReactElement | null {
  const s = props.statuses[props.index];
  const [playing, setPlaying] = useState(false);
  const audio = useRef<{ stop: () => void } | undefined>(undefined);
  const stop = () => { audio.current?.stop(); audio.current = undefined; setPlaying(false); };
  const start = (p: Status) => {
    stop();
    if (!p.url || p.body !== undefined) return;
    props.pauseEpisode();
    audio.current = playVoice(p.url, () => { audio.current = undefined; setPlaying(false); });
    setPlaying(true);
  };
  // FR-006: plays on open, and each time the viewer moves to another status.
  useEffect(() => { if (s) start(s); return stop; }, [s?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (side: 'left' | 'right') => {
    const next = stepStatus(props.index, props.statuses.length, side);
    if (next === null) { if (side === 'right') props.onClose(); return; }
    props.onIndex(next);
  };
  const live = useRef({ onClose: props.onClose });
  live.current.onClose = props.onClose;
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
    onPanResponderRelease: (_e, g) => { if (g.dy > CLOSE_DY) live.current.onClose(); },
  }), []);

  if (!s) return null;
  const now = Date.now();
  const who = s.mine ? 'You' : s.author.name;
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-24 gap-section" keyboardShouldPersistTaps="handled">
      {/* Where we are in the row: one bar per status, the current one filled. */}
      <Box className="flex-row gap-1 pt-gap" accessible accessibilityLabel={`Status ${props.index + 1} of ${props.statuses.length}`}>
        {props.statuses.map((x, i) => <Box key={x.id} className={`flex-1 h-1 rounded-pill ${i <= props.index ? 'bg-accent' : 'bg-track'}`} />)}
      </Box>
      <Box className="flex-row items-center gap-row">
        <Avatar url={s.author.avatarUrl ?? null} name={s.author.name} size={40} />
        <Box className="flex-1">
          <Text className="text-text text-body font-bold" numberOfLines={1}>{who}</Text>
          <Text className="text-muted text-xs">{`${hoursLeft(s.expiresAt, now)} h left`}</Text>
        </Box>
        {s.suggested ? <Box className="bg-accentTint rounded-pill px-row py-1"><Text className="text-accent text-xs font-bold">Suggested</Text></Box> : null}
        {!s.mine && props.onMore ? (
          <Pressable onPress={() => { stop(); props.onMore?.(s); }} accessibilityRole="button" accessibilityLabel={`More for ${who}'s status`} className="items-center justify-center" style={{ width: hit.min, height: hit.min }}>
            <Icon name="ellipsis-horizontal" size={22} color={props.colours.muted} />
          </Pressable>
        ) : null}
      </Box>

      {/* The stage: swipe down closes; the left, middle and right thirds are three buttons. */}
      <Box className="bg-surface border border-border rounded-row items-center justify-center p-section" style={STAGE} {...pan.panHandlers}>
        {s.body !== undefined ? (
          <Text className="text-text text-hero font-display text-center">{s.body}</Text>
        ) : (
          <Box className="items-center gap-row">
            <Box className={`rounded-pill items-center justify-center ${playing ? 'bg-primary' : 'bg-accentTint'}`} style={DISC}>
              <Icon name={playing ? 'pause' : 'play'} size={44} color={playing ? props.colours.onPrimary : props.colours.accent} />
            </Box>
            <Text className="text-muted text-meta">{`${mmss(s.durationMs)}${playing ? ' · playing' : ''}`}</Text>
            {s.text ? <Text className="text-text text-body text-center" numberOfLines={6}>{`“${s.text}”`}</Text> : null}
          </Box>
        )}
        <Box className="absolute inset-0 flex-row">
          <Pressable onPress={() => move('left')} accessibilityRole="button" accessibilityLabel="Previous status" className="flex-1" />
          <Pressable onPress={() => (playing ? stop() : start(s))} accessibilityRole="button" accessibilityLabel={s.body !== undefined ? `${who} wrote: ${s.body}` : playing ? 'Stop' : 'Play again'} className="flex-1" />
          <Pressable onPress={() => move('right')} accessibilityRole="button" accessibilityLabel="Next status" className="flex-1" />
        </Box>
      </Box>

      {s.items.length > 0 ? (
        <Card>
          {s.items.map((it, i) => (
            <Box key={`${s.id}:${i}`} className={it.kind === 'photo' ? 'py-row' : ''}>
              {i > 0 ? <CardDivider /> : null}
              <StatusItemCard item={it} colours={props.colours} onPlay={(id) => { stop(); props.playEpisode(id); }} />
            </Box>
          ))}
        </Card>
      ) : null}

      <StatusReplies status={s} colours={props.colours} pauseAll={() => { stop(); props.pauseEpisode(); }} onChanged={props.reload} />
    </ScrollView>
  );
}
