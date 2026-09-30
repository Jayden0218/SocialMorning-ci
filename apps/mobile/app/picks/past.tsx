/**
 * Past picks (M12 FR-070): the editor's picks of earlier days, newest first, a day's date as
 * its section title — seven days a page from `GET /v1/picks/past`, the next page by `next`.
 * A pick whose episode the server cannot name yet (`episode: null`) keeps its note and opens
 * the show instead; it has no play button, since there is nothing to play.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable } from '../../src/ui/lib/pressable';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { hit } from '../../src/design';
import { Loader } from '../../src/ui/Loader';
import { Screen } from '../../src/ui/Screen';
import { EmptyPicture } from '../../src/ui/me/parts';
import { EpisodeLine } from '../../src/ui/discover/parts';
import { useCardActions } from '../../src/discover/useDiscover';
import { dayTitle } from '../../src/discover/sections';
import { useSafety } from '../../src/safety/context';
import { useM12Api, type PastPick, type PastPicksDay } from '../../src/social/m12-api';

const TAP = { minHeight: hit.min };
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; days: PastPicksDay[]; next?: string; more: 'idle' | 'loading' | 'error' };

export default function PastPicksScreen(): React.ReactElement {
  const router = useRouter();
  // Phone walk 2026-09-30: the first page repeated the day Discover already shows; it starts before it now.
  const { before } = useLocalSearchParams<{ before?: string }>();
  const m12 = useM12Api();
  const { open, play } = useCardActions();
  const { hiddenFeeds } = useSafety();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const first = useCallback(() => {
    setState({ kind: 'loading' });
    m12.pastPicks(typeof before === 'string' && before !== '' ? before : undefined).then(
      (r) => setState({ kind: 'ok', days: r.days, ...(r.next ? { next: r.next } : {}), more: 'idle' }),
      () => setState({ kind: 'error' }),
    );
  }, [m12, before]);
  useEffect(() => { first(); }, [first]);

  const loadMore = (): void => {
    if (state.kind !== 'ok' || !state.next || state.more === 'loading') return;
    const before = state.next;
    setState({ ...state, more: 'loading' });
    m12.pastPicks(before).then(
      (r) => setState((s) => (s.kind === 'ok' ? { kind: 'ok', days: [...s.days, ...r.days], ...(r.next ? { next: r.next } : {}), more: 'idle' } : s)),
      () => setState((s) => (s.kind === 'ok' ? { ...s, more: 'error' } : s)),
    );
  };

  const openShow = (feedUrl: string) => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(feedUrl) } });
  const row = (p: PastPick, i: number): React.ReactElement => {
    if (p.episode) {
      const card = p.episode;
      return <EpisodeLine key={`${card.id}-${i}`} card={card} {...(p.why ? { line: `“${p.why}”` } : {})} onOpen={() => void open(card)} onPlay={() => void play(card)} />;
    }
    // No episode yet: the note, and the show it came from.
    return (
      <Pressable key={`${p.feedUrl}-${i}`} onPress={() => openShow(p.feedUrl)} accessibilityRole="link" accessibilityLabel={`${p.why}. Open the show`} className="justify-center py-row" style={TAP}>
        <Text className="text-text text-sm" numberOfLines={3}>“{p.why}”</Text>
        <Text className="text-muted text-xs mt-1">Open the show →</Text>
      </Pressable>
    );
  };

  const days = state.kind === 'ok'
    ? state.days.map((d) => ({ ...d, picks: d.picks.filter((p) => !hiddenFeeds.has(p.feedUrl)) })).filter((d) => d.picks.length > 0)
    : [];

  return (
    <Screen scroll className="pt-row">
      {state.kind === 'loading' ? <Loader className="my-section" /> : null}
      {state.kind === 'error' ? (
        <Box className="items-center my-section">
          <Text className="text-muted text-sm">Couldn't load past picks right now.</Text>
          <Pressable onPress={first} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center" style={TAP}>
            <Text className="text-accent text-sm font-semibold">Retry</Text>
          </Pressable>
        </Box>
      ) : null}
      {state.kind === 'ok' && days.length === 0 ? <EmptyPicture icon="sparkles-outline" line="No earlier picks yet" /> : null}
      {days.map((d) => (
        <Box key={d.date} className="mb-section">
          <Text className="text-accent text-base font-bold mt-section mb-1" accessibilityRole="header">{dayTitle(d.date)}</Text>
          {d.picks.map(row)}
        </Box>
      ))}
      {state.kind === 'ok' && state.next ? (
        <Pressable onPress={loadMore} accessibilityRole="button" accessibilityLabel="Show earlier days" className="items-center justify-center" style={TAP}>
          {state.more === 'loading' ? <Loader /> : <Text className="text-accent text-sm font-semibold">{state.more === 'error' ? "Couldn't load — try again" : 'Show earlier days'}</Text>}
        </Pressable>
      ) : null}
    </Screen>
  );
}
