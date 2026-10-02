/**
 * One curated issue (M12 FR-101): the editor's intro, then numbered picks, each with the
 * editor's note. From the same curation file as Editor's picks (`picks.json`). A pick the
 * server cannot name as an episode yet keeps its note and opens the show.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable } from '../../src/ui/lib/pressable';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { hit } from '../../src/design';
import { Loader } from '../../src/ui/Loader';
import { Screen } from '../../src/ui/Screen';
import { EpisodeLine } from '../../src/ui/discover/parts';
import { useCardActions } from '../../src/discover/useDiscover';
import { dayTitle } from '../../src/discover/sections';
import { useSafety } from '../../src/safety/context';
import { useM12Api, type Issue } from '../../src/social/m12-api';
import { PageHeader } from '../../src/ui/PageHeader';

const TAP = { minHeight: hit.min };
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; issue: Issue };

export default function IssueScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const m12 = useM12Api();
  const { open, play } = useCardActions();
  const { hiddenFeeds } = useSafety();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(() => {
    setState({ kind: 'loading' });
    m12.issue(String(id)).then((issue) => setState({ kind: 'ok', issue }), () => setState({ kind: 'error' }));
  }, [m12, id]);
  useEffect(() => { load(); }, [load]);
  const items = state.kind === 'ok' ? [...state.issue.items].sort((a, b) => a.order - b.order).filter((i) => !hiddenFeeds.has(i.feedUrl)) : [];
  return (
    <>
    <PageHeader title={state.kind === 'ok' ? state.issue.title : 'Issue'} />
    <Screen scroll className="pt-row">
      {state.kind === 'loading' ? <Loader className="my-section" /> : null}
      {state.kind === 'error' ? (
        <Box className="items-center my-section">
          <Text className="text-muted text-sm">Couldn't load this issue.</Text>
          <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center" style={TAP}><Text className="text-accent text-sm font-semibold">Retry</Text></Pressable>
        </Box>
      ) : null}
      {state.kind === 'ok' ? (
        <>
          <Text className="text-text text-xl font-bold" accessibilityRole="header">{state.issue.title}</Text>
          <Text className="text-muted text-xs mt-1">{dayTitle(state.issue.date)}</Text>
          {state.issue.intro ? <Text className="text-text text-sm mt-section leading-[21px]">{state.issue.intro}</Text> : null}
          {items.map((it, i) => (
            <Box key={`${it.order}-${it.feedUrl}`} className="mt-section">
              <Text className="text-accent text-base font-bold">{String(i + 1).padStart(2, '0')}</Text>
              {it.episode ? (
                <EpisodeLine card={it.episode} onOpen={() => void open(it.episode!)} onPlay={() => void play(it.episode!)} />
              ) : (
                <Pressable onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(it.feedUrl) } })} accessibilityRole="link" accessibilityLabel="Open the show" className="justify-center" style={TAP}>
                  <Text className="text-accent text-sm">Open the show →</Text>
                </Pressable>
              )}
              {it.note ? <Box className="bg-surface rounded-row p-row"><Text className="text-muted text-sm">“{it.note}”</Text></Box> : null}
            </Box>
          ))}
        </>
      ) : null}
    </Screen>
    </>
  );
}
