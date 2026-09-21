/**
 * A clip link opened on this phone (M4 US1, FR-003/FR-004). Both link forms land here
 * (expo-router: `socialmorning://clip/<id>` and the verified https link). Works signed
 * out: clips are public. Resolution order in `src/graph/resolve.ts`.
 */
import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSocial } from '../../src/social/context';
import { useStores } from '../../src/ui/providers';
import { usePlayer, usePlayerState } from '../../src/playback/store';
import { refreshShow } from '../../src/feeds/fetch';
import { resolveClipEpisode, type Resolved } from '../../src/graph/resolve';
import { ClipCard } from '../../src/ui/ClipCard';
import { shareClip } from '../../src/graph/share';
import { apiBaseUrl } from '../../src/social/base-url';
import { ApiError, type Clip } from '../../src/social/api';

type Status = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; clip: Clip; resolved: Resolved };

export default function ClipScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, listener } = useSocial();
  const stores = useStores();
  const player = usePlayer();
  const state = usePlayerState();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    setStatus({ kind: 'loading' });
    (async () => {
      try {
        const { clip, episode } = await api.getClip(String(id));
        const resolved = await resolveClipEpisode({ stores, refreshShow: (url) => refreshShow(url, stores.feeds, Date.now()) }, episode);
        if (!live) return;
        setStatus({ kind: 'ready', clip, resolved });
        if (!clip.deleted) player.playClip(resolved.episode, { startMs: clip.startMs, endMs: clip.endMs });
      } catch (e) {
        if (!live) return;
        const message = e instanceof ApiError ? (e.code === 'not_found' ? 'No such clip.' : e.code === 'network' ? "Couldn't reach the server." : e.message) : String(e);
        setStatus({ kind: 'error', message });
      }
    })();
    return () => { live = false; };
  }, [id, api, stores, player]);

  if (status.kind === 'loading') return <View style={styles.body}><Text>Opening the clip…</Text></View>;
  if (status.kind === 'error') return <View style={styles.body}><Text>{status.message}</Text></View>;
  const { clip, resolved } = status;
  const inClip = player.clip() !== undefined;
  const pausedAtEnd = state.kind === 'paused' && !inClip && 'positionMs' in state && Math.abs(state.positionMs - clip.endMs) <= 6_000;
  return (
    <View style={styles.body}>
      <Text style={styles.title}>{resolved.episode.title}</Text>
      {resolved.episode.showTitle ? <Text style={styles.muted}>{resolved.episode.showTitle}{resolved.via === 'server' ? ' · from the server\'s record (the feed no longer lists it)' : ''}</Text> : null}
      <ClipCard
        clip={clip}
        onPlay={clip.deleted ? undefined : () => player.playClip(resolved.episode, { startMs: clip.startMs, endMs: clip.endMs })}
        onShare={clip.deleted ? undefined : () => void shareClip(Share, clip, resolved.episode.title, apiBaseUrl())}
        onDelete={!clip.deleted && listener?.listenerId === clip.author.id ? () => void api.deleteClip(clip.id).then(() => setStatus({ kind: 'ready', clip: { ...clip, deleted: true }, resolved })) : undefined}
      />
      {clip.deleted ? <Text style={styles.muted}>This clip was removed. The episode is still here.</Text> : null}
      <View style={styles.row}>
        {clip.deleted ? <Pressable style={styles.primary} accessibilityRole="button" onPress={() => { player.load(resolved.episode, 'play'); router.push('/player'); }}><Text style={styles.primaryText}>Play the episode</Text></Pressable> : null}
        {pausedAtEnd ? <Pressable style={styles.primary} accessibilityRole="button" onPress={() => player.play()}><Text style={styles.primaryText}>Keep listening</Text></Pressable> : null}
        <Pressable style={styles.secondary} accessibilityRole="button" onPress={() => router.push('/player')}><Text>Open player</Text></Pressable>
      </View>
      {!listener ? <Text style={styles.muted}>You are not signed in — clips play anyway. Sign in to follow people and make your own.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '600' },
  muted: { color: '#666' },
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'center' },
  primary: { backgroundColor: '#111', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10 },
  primaryText: { color: '#fff', fontWeight: '600' },
  secondary: { borderWidth: 1, borderColor: '#333', borderRadius: 24, paddingHorizontal: 18, paddingVertical: 10 },
});
