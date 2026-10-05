// Short voice posts from you and people you follow; tap to play, record new.
/**
 * Voice statuses on Updates (M12 FR-104): yours and the people you follow, newest first,
 * each gone 24 h after it was posted. Tap to play (episode playback pauses), tap again to
 * stop; long-press your own to delete it. "+ Voice" records one.
 *
 * M17 (`Library-B`, T041): an eyebrow "Voices · last 48 h" over a row of pills — a dashed
 * "Voice" pill to record, then one white pill per status (initials disc + name); the one
 * playing turns yellow with a stop mark. Same buttons, names, tap / long-press as before.
 * Owner, 2026-10-05: circles instead of pills (a ringed disc, the name under it); 24 h, not 48.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { useConfirm } from '@/ui/kit/confirm';
import { playVoice } from '@/playback/expo-audio-adapter';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Icon } from '@/ui/kit/Icon';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { hit } from '@/design';
import { mmss } from '@/ui/kit/format';
import type { VoicePost } from '@/social/m12-api';
import { hoursLeft } from '@/social/voice';

/** A 64 pt ring round a 56 pt disc, in a 64 pt-wide column with the name under it. */
const RING = { width: 64, height: 64 };
const DISC = { width: 56, height: 56 };
const ITEM = { width: 64, minHeight: hit.min };

export function voiceLabel(p: VoicePost, now: number, playing: boolean): string {
  const s = Math.round(p.durationMs / 1000);
  return `${p.mine ? 'Your' : `${p.author.name}'s`} voice status, ${s} seconds, ${hoursLeft(p.expiresAt, now)} hours left${p.text ? `. It says: ${p.text}` : ''}${playing ? ', playing. Tap to stop' : ''}${p.mine ? '. Long-press to delete' : ''}`;
}

export function VoicePosts(props: { load: () => Promise<VoicePost[]>; remove: (id: string) => Promise<void>; pauseEpisode: () => void; colours: { accent: string; muted: string } }): React.ReactElement | null {
  const router = useRouter();
  const [posts, setPosts] = useState<VoicePost[]>([]);
  const [playing, setPlaying] = useState<string | undefined>();
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
    props.pauseEpisode();
    audio.current = playVoice(p.url, stop);
    setPlaying(p.id);
  };
  const askDelete = (p: VoicePost) => {
    if (!p.mine) return;
    confirm({
      title: 'Delete this voice status?',
      message: 'It is removed for everyone now.',
      cancel: 'Keep',
      action: 'Delete',
      onConfirm: () => { if (playing === p.id) stop(); void props.remove(p.id).then(refresh, () => undefined); },
    });
  };
  const now = Date.now();
  return (
    <Box className="pt-section">
      <Eyebrow className="px-screen-x">Voices · last 24 h</Eyebrow>
      {/* Owner, 2026-10-05: one circle per voice, the name under it — a ring while it waits, yellow while it plays. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-section px-screen-x" className="pt-2">
        <Pressable onPress={() => router.push('/voice/new')} accessibilityRole="button" accessibilityLabel="Record a voice status" className="items-center gap-1" style={ITEM}>
          <Box className="rounded-pill border-2 border-dashed border-accent items-center justify-center" style={RING}>
            <Box className="rounded-pill bg-playDisc items-center justify-center" style={DISC}>
              <Icon name="mic-outline" size={22} color={props.colours.accent} />
            </Box>
          </Box>
          <Text className="text-accent text-xs font-bold" numberOfLines={1}>Voice</Text>
        </Pressable>
        {posts.map((p) => {
          const on = playing === p.id;
          return (
            <Pressable key={p.id} onPress={() => toggle(p)} onLongPress={() => askDelete(p)} accessibilityRole="button" accessibilityLabel={voiceLabel(p, now, playing === p.id)} className="items-center gap-1" style={ITEM}>
              <Box className={`rounded-pill border-2 items-center justify-center ${on ? 'border-primary' : 'border-accent'}`} style={RING}>
                <Box className={`rounded-pill items-center justify-center ${on ? 'bg-primary' : 'bg-accentTint'}`} style={DISC}>
                  {on ? <Icon name="stop" size={18} color={props.colours.accent} /> : <Text className="text-text text-meta font-bold">{p.author.initials ?? '·'}</Text>}
                </Box>
              </Box>
              <Text className="text-text text-xs font-semibold" numberOfLines={1}>{on ? mmss(p.durationMs) : p.mine ? 'You' : p.author.name}</Text>
            </Pressable>
          );
        })}
        {dialog}
      </ScrollView>
      {/* M20 US3: the text of the voice that is playing, under the strip. */}
      {(() => { const p = posts.find((x) => x.id === playing); return p?.text ? <Text className="px-screen-x pt-row text-text text-sm" numberOfLines={4}>{`“${p.text}” — ${p.mine ? 'You' : p.author.name}`}</Text> : null; })()}
    </Box>
  );
}
