// Short voice and text statuses from you and people you follow; tap to play or read, post new.
/**
 * Voice statuses on Updates (M12 FR-104): yours and the people you follow, newest first,
 * each gone 24 h after it was posted. Tap to play (episode playback pauses), tap again to
 * stop; long-press your own to delete it.
 *
 * M17 (`Library-B`, T041): an eyebrow over a row of statuses.
 * Owner, 2026-10-05: circles instead of pills (a ringed disc, the name under it); 24 h, not 48.
 *
 * M21 US8 (FR-070, FR-071): the first circle is your own avatar with a "+"; it opens a chooser —
 * Voice (record, `/voice/new`) or Text (`/status/text`, ≤ 140 characters, also gone at 24 h).
 * A text status has no audio: tapping it shows its words under the row, tapping again hides them.
 *
 * M22 US2 (FR-006, FR-010, T021): a tap on a circle opens the full-screen viewer (`/status/<id>`),
 * which plays it and moves through the row. The row now comes with up to 5 "Suggested" statuses
 * from public accounts you don't follow (GET /v1/voice-posts?suggested=1), after the people you
 * follow, each marked "Suggested" under its circle. If that call fails, the old list (`load`) is used.
 *
 * M31 W4-D (T053; design-pulse2 `voice-posts--chooser-sheet`, `voice-posts--delete-dialog`, the rail of `updatesCtx`): the rail is 58 circles
 * 14 apart from 16 in, the name under each in Geist 600 11; a status has the hot → violet ring (2) round its avatar (54, a 2 void border),
 * "New" is a line-coloured ring round a raise disc with a hot-text plus (22), its name in hot-text; "Suggested" is hot-text under the name.
 * The drawing has no "Statuses · last 24 h" eyebrow, so it is gone from the rail (the circles say who they are). The chooser is the kit sheet:
 * "New status · gone after 24 h" as its title, the Panel rows Voice · up to 60 seconds / Text · up to 140 characters, and the quiet Cancel.
 * Holding your own circle asks in the kit dialog (Cancel quiet, Delete hot). Taps, labels and destinations are as before.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { useConfirm } from '@/ui/kit/confirm';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Icon } from '@/ui/kit/Icon';
import { avatarTone } from '@/ui/kit/Avatar';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { PanelRow } from '@/ui/kit/PanelRow';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { PanelGroup } from '@/ui/me/Panel';
import { LinearGradient } from '@/design/tailwind';
import { colour, hit, spacing } from '@/design';
import { mmss } from '@/ui/kit/format';
import type { VoicePost } from '@/social/m12-api';
import { useM22SocialApi, type Status } from '@/social/api-m22-social';
import { hoursLeft } from '@/social/voice';
import { nowMs as clockMs } from '@/ui/kit/clock';

/** The drawn rail: 58 circles 14 apart from 16 in; the ring is 2, the avatar inside it 54. */
const RAIL_DRAWN = { circle: 58, inner: 54, gap: 14, lead: 16, ring: 2, plus: 22 } as const;
/**
 * M31 D-A (design-pulse2 `index.html#updates--screen`, the Voice row): on the Updates tab the circles are 56 with a 2 void gap and a 2 ring round
 * them (64 over all), 12 apart from 28 in — the box-shadows' spill is part of the circle here, so the gap between items is 12 less the 8 of
 * spill and the lead 28 less 4. The first circle is yours, "You" with the mic.
 */
const RAIL_UPDATES = { circle: 64, inner: 60, gap: 4, lead: 24, ring: 2, plus: 22 } as const;
const ITEM_MIN = { minHeight: hit.min };
const fill = (r: { circle: number }) => ({ position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0, borderRadius: r.circle / 2 });
const RING_COLOURS = [colour.hot, colour.violet] as const;
const CORNERS = { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } as const;

export function voiceLabel(p: VoicePost, now: number, playing: boolean): string {
  if (p.body !== undefined) {
    return `${p.mine ? 'Your' : `${p.author.name}'s`} text status, ${hoursLeft(p.expiresAt, now)} hours left. ${playing ? `It says: ${p.body}. Tap to hide` : 'Tap to read'}${p.mine ? '. Long-press to delete' : ''}`;
  }
  const s = Math.round(p.durationMs / 1000);
  return `${p.mine ? 'Your' : `${p.author.name}'s`} voice status, ${s} seconds, ${hoursLeft(p.expiresAt, now)} hours left${p.text ? `. It says: ${p.text}` : ''}${playing ? ', playing. Tap to stop' : ''}${p.mine ? '. Long-press to delete' : ''}`;
}

export function VoicePosts(props: {
  load: () => Promise<VoicePost[]>; remove: (id: string) => Promise<void>; pauseEpisode: () => void; colours: { accent: string; muted: string; text: string };
  /** M21 US8: me, for the first circle (photo, or my letters). */
  me?: { name: string; avatarUrl?: string | undefined };
  /** `updates`: the Updates tab's Voice row (56 circles); `rail`: the status rail as drawn in the voice-posts entries. */
  variant?: 'rail' | 'updates';
}): React.ReactElement | null {
  const RAIL = props.variant === 'updates' ? RAIL_UPDATES : RAIL_DRAWN;
  const RING = { width: RAIL.circle, height: RAIL.circle, padding: RAIL.ring };
  const INNER = { width: RAIL.inner, height: RAIL.inner };
  const ITEM = { width: RAIL.circle, gap: props.variant === 'updates' ? 2 : spacing.gap, ...ITEM_MIN };
  const FILL = fill(RAIL);
  const router = useRouter();
  const [posts, setPosts] = useState<(VoicePost & { suggested?: boolean })[]>([]);
  const m22 = useM22SocialApi();
  const [playing, setPlaying] = useState<string | undefined>();
  const [chooser, setChooser] = useState(false);
  const audio = useRef<{ stop: () => void } | undefined>(undefined);
  const { load } = props;
  // M22: the row with suggestions; the older list when that fails.
  const refresh = useCallback(() => { m22.statuses().then((rows: Status[]) => setPosts(rows), () => { load().then(setPosts, () => undefined); }); }, [load, m22]);
  // M16a T003 (FR-013): the app's own dialog, not the iOS alert.
  const [confirm, dialog] = useConfirm();
  useFocusEffect(refresh);
  const stop = () => { audio.current?.stop(); audio.current = undefined; setPlaying(undefined); };
  useEffect(() => () => stop(), []);

  // M22 US2: the viewer plays it (and the episode pauses there).
  const toggle = (p: VoicePost) => {
    stop();
    router.push({ pathname: '/status/[id]', params: { id: p.id } });
  };
  const askDelete = (p: VoicePost) => {
    if (!p.mine) return;
    confirm({
      title: p.body !== undefined ? 'Delete this text status?' : 'Delete this voice status?',
      message: 'It is removed for everyone now.',
      cancel: 'Keep',
      action: 'Delete',
      onConfirm: () => { if (playing === p.id) stop(); void props.remove(p.id).then(refresh, () => undefined); },
    });
  };
  const now = clockMs();
  const shown = posts.find((x) => x.id === playing);
  return (
    <Box>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: RAIL.gap, paddingLeft: RAIL.lead, paddingRight: RAIL.lead }}>
        {/* M21 US8: my avatar with "+", opening the Voice / Text chooser. */}
        <Pressable onPress={() => setChooser(true)} accessibilityRole="button" accessibilityLabel="Post a status: voice or text" className="items-center" style={ITEM}>
          <Box className="items-center justify-center" style={RING}>
            <Box testID="status-new-ring" className="border-line" style={[FILL, { borderWidth: RAIL.ring }]} />
            <Box className="rounded-pill bg-raise items-center justify-center" style={INNER}>
              <Icon name={props.variant === 'updates' ? 'mic-outline' : 'add'} size={RAIL.plus} color={colour.hotText} />
            </Box>
          </Box>
          <Type step="chip" className="text-hotText" numberOfLines={1}>{props.variant === 'updates' ? 'You' : 'New'}</Type>
        </Pressable>
        {posts.map((p) => {
          const on = playing === p.id;
          const isText = p.body !== undefined;
          return (
            <Pressable key={p.id} onPress={() => toggle(p)} onLongPress={() => askDelete(p)} accessibilityRole="button" accessibilityLabel={`${p.suggested ? 'Suggested. ' : ''}${voiceLabel(p, now, playing === p.id)}`} className="items-center" style={ITEM}>
              <Box className="items-center justify-center" style={RING}>
                <LinearGradient testID="status-ring" colors={RING_COLOURS} start={CORNERS.start} end={CORNERS.end} style={FILL} />
                <Box className="rounded-pill items-center justify-center bg-raise border-void" style={[INNER, { borderWidth: RAIL.ring }, !on && !isText ? { backgroundColor: avatarTone(p.author.name).fill } : null]}>
                  {on && !isText ? <Icon name="stop" size={18} color={colour.hotText} />
                    : isText ? <Icon name="chatbubble-ellipses-outline" size={20} color={colour.hotText} />
                      : <Type step="chip" className={avatarTone(p.author.name).ink === 'text' ? 'text-text' : 'text-void'}>{p.author.initials ?? '·'}</Type>}
                </Box>
              </Box>
              <Type step="chip" className="text-text" numberOfLines={1}>{on && !isText ? mmss(p.durationMs) : p.mine ? 'You' : p.author.name}</Type>
              {p.suggested ? <Type step="tag" className="text-hotText" numberOfLines={1}>Suggested</Type> : null}
            </Pressable>
          );
        })}
        {dialog}
      </ScrollView>
      {/* M20 US3: the text of the voice that is playing; M21 US8: or the words of the text status picked. */}
      {shown?.body !== undefined ? <Type step="note" className="px-screen-x pt-row text-text" numberOfLines={6}>{`${shown.body} — ${shown.mine ? 'You' : shown.author.name}`}</Type>
        : shown?.text ? <Type step="note" className="px-screen-x pt-row text-text" numberOfLines={4}>{`“${shown.text}” — ${shown.mine ? 'You' : shown.author.name}`}</Type> : null}
      <ActionSheet open={chooser} onClose={() => setChooser(false)} label="New status" title="New status · gone after 24 h">
        <PanelGroup>
          <PanelRow icon="mic-outline" label="Voice · up to 60 seconds" accessibilityLabel="Record a voice status" onPress={() => { setChooser(false); router.push('/voice/new'); }} />
          <PanelRow icon="create-outline" label="Text · up to 140 characters" accessibilityLabel="Write a text status" onPress={() => { setChooser(false); router.push('/status/text'); }} />
        </PanelGroup>
        <PulseButton label="Cancel" kind="quiet" onPress={() => setChooser(false)} full />
      </ActionSheet>
    </Box>
  );
}
