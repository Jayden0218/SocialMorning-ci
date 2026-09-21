/** The episode's clips (M4 FR-006): pending ones first as "sending", then newest first. */
import { Share, StyleSheet, Text, View } from 'react-native';
import { useGraph } from '../graph/context';
import { useSocial } from '../social/context';
import { usePlayer, type PlayableEpisode } from '../playback/store';
import { shareClip } from '../graph/share';
import { apiBaseUrl } from '../social/base-url';
import { ClipCard } from './ClipCard';
import type { Clip } from '../social/api';

export function ClipList(props: { episode: PlayableEpisode }): React.ReactElement {
  const { useEpisodeClips } = useGraph();
  const { api, listener } = useSocial();
  const player = usePlayer();
  const { clips, pending, refresh } = useEpisodeClips(props.episode.id);
  const pendingAsClips: Clip[] = pending.map((p) => ({ id: `pending:${p.clientId}`, author: { id: listener?.listenerId ?? '', displayName: listener?.displayName ?? null }, episodeId: p.episodeId, startMs: p.startMs, endMs: p.endMs, caption: p.caption, createdAt: new Date(p.createdAt).toISOString(), deleted: false }));
  if (clips.length === 0 && pending.length === 0) return <View style={styles.wrap}><Text style={styles.h2}>Clips</Text><Text style={styles.muted}>No clips yet. Clip the good bit from the player.</Text></View>;
  return (
    <View style={styles.wrap}>
      <Text style={styles.h2}>Clips</Text>
      {pendingAsClips.map((c) => <ClipCard key={c.id} clip={c} pending onPlay={() => player.playClip(props.episode, { startMs: c.startMs, endMs: c.endMs })} />)}
      {clips.map((c) => (
        <ClipCard
          key={c.id}
          clip={c}
          onPlay={() => player.playClip(props.episode, { startMs: c.startMs, endMs: c.endMs })}
          onShare={() => void shareClip(Share, c, props.episode.title, apiBaseUrl())}
          onDelete={listener?.listenerId === c.author.id ? () => void api.deleteClip(c.id).then(refresh) : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  h2: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  muted: { color: '#666' },
});
