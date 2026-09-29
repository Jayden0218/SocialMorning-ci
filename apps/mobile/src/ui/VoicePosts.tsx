/**
 * Voice statuses on Updates (M12 FR-104): yours and the people you follow, newest first,
 * each gone 48 h after it was posted. Tap to play (episode playback pauses), tap again to
 * stop; long-press your own to delete it. "+ Voice" records one.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Alert } from 'react-native';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable } from './lib/pressable';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { Icon } from './Icon';
import { hit } from '../design';
import type { VoicePost } from '../social/m12-api';
import { hoursLeft } from '../voice/recording';

const TAP = { minHeight: hit.min };

export function voiceLabel(p: VoicePost, now: number, playing: boolean): string {
  const s = Math.round(p.durationMs / 1000);
  return `${p.mine ? 'Your' : `${p.author.name}'s`} voice status, ${s} seconds, ${hoursLeft(p.expiresAt, now)} hours left${playing ? ', playing. Tap to stop' : ''}${p.mine ? '. Long-press to delete' : ''}`;
}

export function VoicePosts(props: { load: () => Promise<VoicePost[]>; remove: (id: string) => Promise<void>; pauseEpisode: () => void; colours: { accent: string; muted: string } }): React.ReactElement | null {
  const router = useRouter();
  const [posts, setPosts] = useState<VoicePost[]>([]);
  const [playing, setPlaying] = useState<string | undefined>();
  const audio = useRef<AudioPlayer | undefined>(undefined);
  const { load } = props;
  const refresh = useCallback(() => { load().then(setPosts, () => undefined); }, [load]);
  useFocusEffect(refresh);
  const stop = () => { audio.current?.remove(); audio.current = undefined; setPlaying(undefined); };
  useEffect(() => () => stop(), []);

  const toggle = (p: VoicePost) => {
    if (playing === p.id) { stop(); return; }
    stop();
    props.pauseEpisode();
    const a = createAudioPlayer(p.url);
    a.addListener('playbackStatusUpdate', (s) => { if (s.didJustFinish) stop(); });
    a.play();
    audio.current = a;
    setPlaying(p.id);
  };
  const askDelete = (p: VoicePost) => {
    if (!p.mine) return;
    Alert.alert('Delete this voice status?', 'It is removed for everyone now.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { if (playing === p.id) stop(); void props.remove(p.id).then(refresh, () => undefined); } },
    ]);
  };
  const now = Date.now();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-row px-screen-x" className="pt-row">
      <Pressable onPress={() => router.push('/voice/new')} accessibilityRole="button" accessibilityLabel="Record a voice status" className="items-center gap-1 w-16" style={TAP}>
        <Box className="w-12 h-12 rounded-pill bg-accentTint items-center justify-center"><Icon name="mic-outline" size={22} color={props.colours.accent} /></Box>
        <Text className="text-muted text-xs">+ Voice</Text>
      </Pressable>
      {posts.map((p) => (
        <Pressable key={p.id} onPress={() => toggle(p)} onLongPress={() => askDelete(p)} accessibilityRole="button" accessibilityLabel={voiceLabel(p, now, playing === p.id)} className="items-center gap-1 w-16" style={TAP}>
          <Box className={`w-12 h-12 rounded-pill items-center justify-center ${playing === p.id ? 'bg-primary' : 'bg-surface'}`}>
            {playing === p.id ? <Icon name="stop" size={20} color={props.colours.accent} /> : <Text className="text-text text-base font-bold">{p.author.initials ?? '·'}</Text>}
          </Box>
          <Text className="text-muted text-xs" numberOfLines={1}>{p.mine ? 'You' : p.author.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
