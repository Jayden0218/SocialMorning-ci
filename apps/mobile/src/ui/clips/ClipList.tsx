// The episode's clips, sending ones first, then newest first.
/**
 * The episode's clips (M4 FR-006): pending ones first as "sending", then newest first.
 * M17 (`Episode-B`): the "Clips" heading is the shared serif section title, as Comments is.
 */
import { useMemo, useState } from 'react';
import { Share } from 'react-native';
import { Box } from '@/ui/lib/box';
import { router } from 'expo-router';
import { useSafety } from '@/safety/context';
import { ReportSheet, type ReportTarget } from '@/ui/comments/ReportSheet';
import { useGraph } from '@/graph/context';
import { useSocial } from '@/social/context';
import { usePlayer, type PlayableEpisode } from '@/playback/store';
import { shareClip } from '@/graph/share';
import { apiBaseUrl } from '@/social/base-url';
import { ClipCard } from './ClipCard';
import { useClipVideoRows, useSharePanel } from './ShareChooser';
import type { Clip } from '@/social/api';
import { EmptyState } from '@/ui/kit/EmptyState';
import { SectionTitle } from '@/ui/discover/parts';

export function ClipList(props: { episode: PlayableEpisode }): React.ReactElement {
  const { useEpisodeClips } = useGraph();
  const { api, listener } = useSocial();
  const player = usePlayer();
  const { clips: allClips, pending, refresh } = useEpisodeClips(props.episode.id);
  const safety = useSafety();
  const clips = useMemo(() => safety.clips(allClips), [allClips, safety]);
  const [reporting, setReporting] = useState<ReportTarget | undefined>();
  // M16a T005 (FR-015): the app's share panel first; the system sheet behind "More".
  const [share, sharePanel] = useSharePanel();
  // M19: "Share as video" when this build can make one and the clip is at most 60 s.
  const videoRows = useClipVideoRows();
  const pendingAsClips: Clip[] = pending.map((p) => ({ id: `pending:${p.clientId}`, author: { id: listener?.listenerId ?? '', displayName: listener?.displayName ?? null }, episodeId: p.episodeId, startMs: p.startMs, endMs: p.endMs, caption: p.caption, createdAt: new Date(p.createdAt).toISOString(), deleted: false }));
  if (clips.length === 0 && pending.length === 0) return <Box className="mt-section"><Box className="-mx-screen-x"><SectionTitle title="Clips" /></Box><EmptyState surface="clips" action={{ label: 'Open player', onPress: () => router.push('/player') }} /></Box>;
  return (
    <Box className="mt-section">
      <Box className="-mx-screen-x"><SectionTitle title="Clips" /></Box>
      {pendingAsClips.map((c) => <ClipCard key={c.id} clip={c} pending onPlay={() => player.playClip(props.episode, { startMs: c.startMs, endMs: c.endMs })} />)}
      {clips.map((c) => (
        <ClipCard
          key={c.id}
          clip={c}
          onPlay={() => player.playClip(props.episode, { startMs: c.startMs, endMs: c.endMs })}
          onShare={() => share({ heading: 'Share this clip', rows: videoRows(c, props.episode), more: { detail: 'other apps', run: () => void shareClip(Share, c, props.episode.title, apiBaseUrl()) } })}
          onDelete={listener?.listenerId === c.author.id ? () => void api.deleteClip(c.id).then(refresh) : undefined}
          onReport={listener?.listenerId !== c.author.id ? () => setReporting({ kind: 'clip', id: c.id, authorId: c.author.id, label: 'clip' }) : undefined}
        />
      ))}
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
      {sharePanel}
    </Box>
  );
}

