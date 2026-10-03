/**
 * Voice statuses on Updates (M12 FR-104): yours and the people you follow, newest first,
 * each gone 48 h after it was posted. Tap to play (episode playback pauses), tap again to
 * stop; long-press your own to delete it. "+ Voice" records one.
 *
 * M17 (`Library-B`, T041): an eyebrow "Voices · last 48 h" over a row of pills — a dashed
 * "Voice" pill to record, then one white pill per status (initials disc + name); the one
 * playing turns yellow with a stop mark. Same buttons, names, tap / long-press as before.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { useConfirm } from './confirm';
import { playVoice } from '@/playback/expo-audio-adapter';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Icon } from './Icon';
import { Eyebrow } from './Eyebrow';
import { hit } from '@/design';
import { mmss } from './format';
import type { VoicePost } from '@/social/m12-api';
import { hoursLeft } from '@/voice/recording';

const TAP = { minHeight: hit.min };

export function voiceLabel(p: VoicePost, now: number, playing: boolean): string {
  const s = Math.round(p.durationMs / 1000);
  return `${p.mine ? 'Your' : `${p.author.name}'s`} voice status, ${s} seconds, ${hoursLeft(p.expiresAt, now)} hours left${playing ? ', playing. Tap to stop' : ''}${p.mine ? '. Long-press to delete' : ''}`;
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
      <Eyebrow className="px-screen-x">Voices · last 48 h</Eyebrow>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-gap px-screen-x" className="pt-2">
        <Pressable onPress={() => router.push('/voice/new')} accessibilityRole="button" accessibilityLabel="Record a voice status" className="flex-row items-center gap-2 pl-1.5 pr-section rounded-pill border border-dashed border-accent" style={TAP}>
          <Box className="w-8 h-8 rounded-pill bg-accentTint items-center justify-center"><Icon name="mic-outline" size={18} color={props.colours.accent} /></Box>
          <Text className="text-accent text-meta font-bold">Voice</Text>
        </Pressable>
        {posts.map((p) => {
          const on = playing === p.id;
          return (
            <Pressable key={p.id} onPress={() => toggle(p)} onLongPress={() => askDelete(p)} accessibilityRole="button" accessibilityLabel={voiceLabel(p, now, playing === p.id)} className={`flex-row items-center gap-2 pl-1.5 pr-row rounded-pill border border-border ${on ? 'bg-primary' : 'bg-surface'}`} style={TAP}>
              <Box className={`w-8 h-8 rounded-pill items-center justify-center ${on ? 'bg-surface' : 'bg-accentTint'}`}>
                {on ? <Icon name="stop" size={14} color={props.colours.accent} /> : <Text className="text-text text-micro font-bold">{p.author.initials ?? '·'}</Text>}
              </Box>
              <Text className={on ? 'text-onPrimary text-meta font-semibold' : 'text-text text-meta font-semibold'} numberOfLines={1}>{`${p.mine ? 'You' : p.author.name}${on ? ` · ${mmss(p.durationMs)}` : ''}`}</Text>
            </Pressable>
          );
        })}
        {dialog}
      </ScrollView>
    </Box>
  );
}
