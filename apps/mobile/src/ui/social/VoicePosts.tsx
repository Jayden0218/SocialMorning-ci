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
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { useConfirm } from '@/ui/kit/confirm';
import { playVoice } from '@/playback/expo-audio-adapter';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { Icon } from '@/ui/kit/Icon';
import { Avatar } from '@/ui/kit/Avatar';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { hit, size } from '@/design';
import { mmss } from '@/ui/kit/format';
import type { VoicePost } from '@/social/m12-api';
import { hoursLeft } from '@/social/voice';

/** A 64 pt ring round a 56 pt disc, in a 64 pt-wide column with the name under it. */
const RING = { width: 64, height: 64 };
const DISC = { width: 56, height: 56 };
const ITEM = { width: 64, minHeight: hit.min };
/** The "+" badge on my own circle. */
const PLUS = { width: 22, height: 22 };
const ROW = { minHeight: size.row };
const TAP = { minHeight: hit.min };

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
}): React.ReactElement | null {
  const router = useRouter();
  const [posts, setPosts] = useState<VoicePost[]>([]);
  const [playing, setPlaying] = useState<string | undefined>();
  const [chooser, setChooser] = useState(false);
  const audio = useRef<{ stop: () => void } | undefined>(undefined);
  const { load } = props;
  const refresh = useCallback(() => { load().then(setPosts, () => undefined); }, [load]);
  // M16a T003 (FR-013): the app's own dialog, not the iOS alert.
  const [confirm, dialog] = useConfirm();
  useFocusEffect(refresh);
  const stop = () => { audio.current?.stop(); audio.current = undefined; setPlaying(undefined); };
  useEffect(() => () => stop(), []);

  const toggle = (p: VoicePost) => {
    if (playing === p.id) { stop(); return; }
    stop();
    if (p.body !== undefined || !p.url) { setPlaying(p.id); return; } // a text status: show its words
    props.pauseEpisode();
    audio.current = playVoice(p.url, stop);
    setPlaying(p.id);
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
  const now = Date.now();
  const shown = posts.find((x) => x.id === playing);
  return (
    <Box className="pt-section">
      <Eyebrow className="px-screen-x">Statuses · last 24 h</Eyebrow>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-section px-screen-x" className="pt-2">
        {/* M21 US8: my avatar with "+", opening the Voice / Text chooser. */}
        <Pressable onPress={() => setChooser(true)} accessibilityRole="button" accessibilityLabel="Post a status: voice or text" className="items-center gap-1" style={ITEM}>
          <Box className="rounded-pill border-2 border-dashed border-accent items-center justify-center" style={RING}>
            <Avatar url={props.me?.avatarUrl ?? null} name={props.me?.name ?? '+'} size={56} />
            <Box className="absolute bottom-0 right-0 rounded-pill bg-primary border-2 border-background items-center justify-center" style={PLUS}>
              <Icon name="add" size={14} color={props.colours.text} />
            </Box>
          </Box>
          <Text className="text-accent text-xs font-bold" numberOfLines={1}>New</Text>
        </Pressable>
        {posts.map((p) => {
          const on = playing === p.id;
          const isText = p.body !== undefined;
          return (
            <Pressable key={p.id} onPress={() => toggle(p)} onLongPress={() => askDelete(p)} accessibilityRole="button" accessibilityLabel={voiceLabel(p, now, playing === p.id)} className="items-center gap-1" style={ITEM}>
              <Box className={`rounded-pill border-2 items-center justify-center ${on ? 'border-primary' : 'border-accent'}`} style={RING}>
                <Box className={`rounded-pill items-center justify-center ${on ? 'bg-primary' : 'bg-accentTint'}`} style={DISC}>
                  {on && !isText ? <Icon name="stop" size={18} color={props.colours.accent} />
                    : isText ? <Icon name="chatbubble-ellipses-outline" size={20} color={props.colours.accent} />
                      : <Text className="text-text text-meta font-bold">{p.author.initials ?? '·'}</Text>}
                </Box>
              </Box>
              <Text className="text-text text-xs font-semibold" numberOfLines={1}>{on && !isText ? mmss(p.durationMs) : p.mine ? 'You' : p.author.name}</Text>
            </Pressable>
          );
        })}
        {dialog}
      </ScrollView>
      {/* M20 US3: the text of the voice that is playing; M21 US8: or the words of the text status picked. */}
      {shown?.body !== undefined ? <Text className="px-screen-x pt-row text-text text-sm" numberOfLines={6}>{`${shown.body} — ${shown.mine ? 'You' : shown.author.name}`}</Text>
        : shown?.text ? <Text className="px-screen-x pt-row text-text text-sm" numberOfLines={4}>{`“${shown.text}” — ${shown.mine ? 'You' : shown.author.name}`}</Text> : null}
      <Actionsheet isOpen={chooser} onClose={() => setChooser(false)}>
        <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
        <ActionsheetContent className="bg-surface rounded-t-row px-screen-x pt-row items-stretch">
          <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
          <Text className="text-sm font-bold text-text py-row">New status · gone after 24 h</Text>
          <Pressable onPress={() => { setChooser(false); router.push('/voice/new'); }} accessibilityRole="button" accessibilityLabel="Record a voice status" className="flex-row items-center gap-section border-b-hairline border-separator" style={ROW}>
            <Icon name="mic-outline" size={20} color={props.colours.accent} />
            <Text className="text-text text-body flex-1">Voice · up to 60 seconds</Text>
          </Pressable>
          <Pressable onPress={() => { setChooser(false); router.push('/status/text'); }} accessibilityRole="button" accessibilityLabel="Write a text status" className="flex-row items-center gap-section border-b-hairline border-separator" style={ROW}>
            <Icon name="create-outline" size={20} color={props.colours.accent} />
            <Text className="text-text text-body flex-1">Text · up to 140 characters</Text>
          </Pressable>
          <Pressable onPress={() => setChooser(false)} accessibilityRole="button" accessibilityLabel="Cancel" className="items-center justify-center mt-row" style={TAP}>
            <Text className="text-accent text-sm font-bold">Cancel</Text>
          </Pressable>
        </ActionsheetContent>
      </Actionsheet>
    </Box>
  );
}
