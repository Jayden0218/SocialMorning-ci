// Today's editor's picks on a page of their own, each with the editor's note.
/**
 * M21 US7 (T084, FR-062): Daily picks — today's picks (`GET /v1/discover/daily`), the note in
 * full under each, Play and + (queue) on every one. "Past picks" leads to the earlier days.
 * A pick whose episode the server cannot name yet opens its show instead.
 *
 * M22 US16: on a tablet (`useOpensInPane`) a pick opens its episode in the right pane
 * (src/ui/shell/ListDetail.tsx); a phone pushes the episode page as before.
 */
import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card } from '@/ui/kit/Card';
import { Loader } from '@/ui/kit/Loader';
import { EndOfList } from '@/ui/kit/EndOfList';
import { EmptyPicture } from '@/ui/me/parts';
import { AddButton, EpisodeLine } from '@/ui/discover/parts';
import { dayTitle } from '@/discover/sections';
import { useCardActions } from '@/discover/useDiscover';
import { useSafety } from '@/safety/context';
import { useExploreApi, type Daily } from '@/discover/explore-api';
import { EpisodePane, ListDetail, useOpensInPane } from '@/ui/shell/ListDetail';

const TAP = { minHeight: hit.min };
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; daily: Daily };

export default function DailyPicksScreen(): React.ReactElement {
  const api = useExploreApi();
  const { open, play, queue } = useCardActions();
  const { hiddenFeeds } = useSafety();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(() => {
    setState({ kind: 'loading' });
    api.daily().then((daily) => setState({ kind: 'ok', daily }), () => setState({ kind: 'error' }));
  }, [api]);
  useEffect(() => { load(); }, [load]);
  const daily = state.kind === 'ok' ? state.daily : undefined;
  const items = (daily?.items ?? []).filter((p) => !hiddenFeeds.has(p.feedUrl));
  const inPane = useOpensInPane();
  const [paneId, setPaneId] = useState<string | undefined>(undefined);
  const pane = inPane ? setPaneId : undefined;
  const past = (): void => { router.push({ pathname: '/picks/past', params: daily?.date ? { before: daily.date } : {} }); };
  return (
    <>
      <PageHeader title="Daily picks" {...(daily?.date ? { subtitle: dayTitle(daily.date) } : {})} />
      <ListDetail
        placeholder="Choose an episode to see it here."
        detail={paneId !== undefined ? <EpisodePane episodeId={paneId} onOpenPage={() => router.push({ pathname: '/episode/[id]', params: { id: paneId } })} /> : undefined}
        list={
      <FlatList
        className="flex-1 bg-background"
        data={items}
        keyExtractor={(p, i) => `${p.feedUrl}#${p.guid ?? i}`}
        contentContainerClassName="px-screen-x pb-24 gap-row flex-grow"
        ListFooterComponent={
          <Box>
            {items.length > 0 ? <EndOfList /> : null}
            <Pressable onPress={past} accessibilityRole="link" accessibilityLabel="Past picks" className="items-center justify-center" style={TAP}>
              <Text className="text-accent text-meta font-semibold">Past picks ›</Text>
            </Pressable>
          </Box>
        }
        ListEmptyComponent={
          state.kind === 'loading' ? <Loader className="my-section" />
          : state.kind === 'error' ? (
            <Box className="items-center my-section">
              <Text className="text-muted text-sm">Couldn't load today's picks.</Text>
              <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center" style={TAP}>
                <Text className="text-accent text-sm font-semibold">Retry</Text>
              </Pressable>
            </Box>
          ) : <EmptyPicture icon="sparkles-outline" line="No picks today yet" />
        }
        renderItem={({ item }) => (
          <Card className="pt-row pb-row">
            {item.episode ? (
              <EpisodeLine card={item.episode} size={64} onOpen={() => item.episode && void open(item.episode, pane)} onPlay={() => item.episode && void play(item.episode)} />
            ) : (
              <Pressable onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(item.feedUrl) } })} accessibilityRole="button" accessibilityLabel="Open the show" style={TAP} className="justify-center">
                <Text className="text-accent text-body font-semibold">Open the show ›</Text>
              </Pressable>
            )}
            <Text className="text-text text-body font-display-semibold mt-gap">{`“${item.why}”`}</Text>
            {item.episode ? (
              <Box className="flex-row justify-end">
                <AddButton title={item.episode.title} onPress={() => item.episode && void queue(item.episode)} />
              </Box>
            ) : null}
          </Card>
        )}
      />
        }
      />
    </>
  );
}
