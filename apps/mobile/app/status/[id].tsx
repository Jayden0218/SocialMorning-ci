// Open one status full screen, with the statuses around it, its items, replies and reactions.
/**
 * M22 US2 (FR-006, T021): the full-screen viewer, opened from a status circle on Updates or from a
 * push / notice (`/status/<id>`). It loads the same row the circles show (GET /v1/voice-posts with
 * suggestions) and starts at this status, so the right and left thirds move through the row; a
 * status that is not in the row (an old link) opens alone. Our own header with Close; no native
 * sheet. An expired status (gone at 24 h) says so.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { PageHeader, goBack } from '@/ui/kit/PageHeader';
import { Loader } from '@/ui/kit/Loader';
import { useColours } from '@/ui/kit/useColours';
import { useStores } from '@/ui/shell/providers';
import { usePlayer } from '@/playback/store';
import { useSocial } from '@/social/context';
import { hit } from '@/design';
import { useM22SocialApi, type Status } from '@/social/api-m22-social';
import { StatusViewer } from '@/ui/social/StatusViewer';

type State = { kind: 'loading' } | { kind: 'gone' } | { kind: 'ok'; statuses: Status[]; index: number };

export default function StatusScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const stores = useStores();
  const c = useColours(stores.settings);
  const player = usePlayer();
  const api = useM22SocialApi();
  const { listener } = useSocial();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async (keep?: string) => {
    const want = keep ?? id;
    if (!want) { setState({ kind: 'gone' }); return; }
    try {
      const row = await api.statuses();
      const at = row.findIndex((s) => s.id === want);
      if (at >= 0) { setState({ kind: 'ok', statuses: row, index: at }); return; }
      setState({ kind: 'ok', statuses: [await api.status(want)], index: 0 });
    } catch {
      setState({ kind: 'gone' });
    }
  }, [api, id]);
  useEffect(() => { void load(); }, [load]);

  const close = () => goBack();
  const current = state.kind === 'ok' ? state.statuses[state.index] : undefined;
  const playEpisode = (episodeId: string) => {
    const it = current?.items.find((x) => x.kind === 'episode' && x.episodeId === episodeId);
    if (!it || it.kind !== 'episode') return;
    if (!it.enclosureUrl) { router.push({ pathname: '/episode/[id]', params: { id: episodeId } }); return; }
    player.load({
      id: episodeId, url: it.enclosureUrl, title: it.title ?? 'Episode', showTitle: it.showTitle ?? '',
      ...(it.imageUrl ? { artworkUrl: it.imageUrl } : {}), ...(it.durationMs !== undefined ? { durationMs: it.durationMs } : {}), ...(it.feedUrl ? { feedUrl: it.feedUrl } : {}),
    }, 'play');
  };

  const title = current ? (current.mine ? 'Your status' : current.author.name) : 'Status';
  return (
    <>
      <PageHeader title={title} left={(
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" className="justify-center px-row" style={{ minHeight: hit.min }}>
          <Text className="text-accent text-body font-bold">Close</Text>
        </Pressable>
      )} />
      {!listener ? (
        <Box className="flex-1 bg-background px-screen-x pt-gap"><Text className="text-muted text-body">Sign in to see statuses.</Text></Box>
      ) : state.kind === 'loading' ? (
        <Box className="flex-1 bg-background items-center pt-section"><Loader /></Box>
      ) : state.kind === 'gone' ? (
        <Box className="flex-1 bg-background px-screen-x pt-gap"><Text className="text-muted text-body">This status is gone. Statuses are deleted 24 hours after they are posted.</Text></Box>
      ) : (
        <StatusViewer
          statuses={state.statuses}
          index={state.index}
          onIndex={(i) => setState({ ...state, index: i })}
          onClose={close}
          pauseEpisode={player.pause}
          playEpisode={playEpisode}
          reload={() => { if (current) void load(current.id); }}
          colours={c}
        />
      )}
    </>
  );
}
