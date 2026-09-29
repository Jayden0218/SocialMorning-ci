/** The episode's clips (M4 FR-006): pending ones first as "sending", then newest first. */
import { useMemo, useState } from 'react';
import { Share } from 'react-native';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { router } from 'expo-router';
import { useSafety } from '../safety/context';
import { ReportSheet, type ReportTarget } from './ReportSheet';
import { useGraph } from '../graph/context';
import { useSocial } from '../social/context';
import { usePlayer, type PlayableEpisode } from '../playback/store';
import { shareClip } from '../graph/share';
import { apiBaseUrl } from '../social/base-url';
import { ClipCard } from './ClipCard';
import type { Clip } from '../social/api';
import { EmptyState } from './EmptyState';

export function ClipList(props: { episode: PlayableEpisode }): React.ReactElement {
  const { useEpisodeClips } = useGraph();
  const { api, listener } = useSocial();
  const player = usePlayer();
  const { clips: allClips, pending, refresh } = useEpisodeClips(props.episode.id);
  const safety = useSafety();
  const clips = useMemo(() => safety.clips(allClips), [allClips, safety]);
  const [reporting, setReporting] = useState<ReportTarget | undefined>();
  const pendingAsClips: Clip[] = pending.map((p) => ({ id: `pending:${p.clientId}`, author: { id: listener?.listenerId ?? '', displayName: listener?.displayName ?? null }, episodeId: p.episodeId, startMs: p.startMs, endMs: p.endMs, caption: p.caption, createdAt: new Date(p.createdAt).toISOString(), deleted: false }));
  if (clips.length === 0 && pending.length === 0) return <Box className="mt-4"><Text className="text-[18px] font-semibold mb-1 text-text" accessibilityRole="header">Clips</Text><EmptyState surface="clips" action={{ label: 'Open player', onPress: () => router.push('/player') }} /></Box>;
  return (
    <Box className="mt-4">
      <Text className="text-[18px] font-semibold mb-1 text-text">Clips</Text>
      {pendingAsClips.map((c) => <ClipCard key={c.id} clip={c} pending onPlay={() => player.playClip(props.episode, { startMs: c.startMs, endMs: c.endMs })} />)}
      {clips.map((c) => (
        <ClipCard
          key={c.id}
          clip={c}
          onPlay={() => player.playClip(props.episode, { startMs: c.startMs, endMs: c.endMs })}
          onShare={() => void shareClip(Share, c, props.episode.title, apiBaseUrl())}
          onDelete={listener?.listenerId === c.author.id ? () => void api.deleteClip(c.id).then(refresh) : undefined}
          onReport={listener?.listenerId !== c.author.id ? () => setReporting({ kind: 'clip', id: c.id, authorId: c.author.id, label: 'clip' }) : undefined}
        />
      ))}
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
    </Box>
  );
}

