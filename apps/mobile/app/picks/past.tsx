/**
 * Past picks (M12 FR-070): the editor's picks of earlier days, newest first, a day's date as
 * its section title — seven days a page from `GET /v1/picks/past`, the next page by `next`.
 * A pick whose episode the server cannot name yet (`episode: null`) keeps its note and opens
 * the show instead; it has no play button, since there is nothing to play.
 *
 * M16a bug 7 (FR-008), checked 2026-10-02: the walk saw this page empty while Discover showed
 * picks dated 2026-09-22. The live server (`GET /v1/picks/past`) has ONE day of picks —
 * 2026-09-22, 3 picks, no `next` — and `?before=2026-09-22` (what Discover passes) returns
 * `{"days":[]}`. So the page was right: correct, one day of picks. An empty answer shows
 * "No earlier picks yet".
 *
 * M17 T055 (`PastPicks-B`): each day is a serif accent date with its pick count; the day's
 * first pick (when it has an episode) is a white card — a wide artwork banner, the editor's
 * note as a serif italic quote, show, title and Play; the other picks are divided rows with
 * the note in muted italic. Loading, paging, hidden shows and every action are unchanged.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Pressable } from '../../src/ui/lib/pressable';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { Image } from '../../src/ui/lib/image';
import { hit } from '../../src/design';
import { Loader } from '../../src/ui/Loader';
import { Screen } from '../../src/ui/Screen';
import { Card } from '../../src/ui/Card';
import { initialOf } from '../../src/ui/Artwork';
import { EmptyPicture } from '../../src/ui/me/parts';
import { EpisodeLine, PlayButton } from '../../src/ui/discover/parts';
import { useCardActions } from '../../src/discover/useDiscover';
import { dayTitle } from '../../src/discover/sections';
import { useSafety } from '../../src/safety/context';
import type { EpisodeCard } from '../../src/social/api';
import { useM12Api, type PastPick, type PastPicksDay } from '../../src/social/m12-api';
import { PageHeader } from '../../src/ui/PageHeader';

const TAP = { minHeight: hit.min };
/** The feature card's artwork banner (`PastPicks-B`: 150 pt high, the card's width). */
const BANNER = { height: 150 };
const BANNER_LETTER = { fontSize: 48 };
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

  /** The day's first pick: banner, the note as a serif quote, show, title, Play. */
  const feature = (p: PastPick, card: EpisodeCard, i: number): React.ReactElement => {
    const letter = initialOf(card.showTitle);
    return (
      <Card key={`${card.id}-${i}`} padded={false} className="overflow-hidden mb-row">
        <Pressable onPress={() => void open(card)} accessibilityRole="button" accessibilityLabel={`${card.title}, ${card.showTitle}`}>
          <Box className="bg-accentTint justify-end p-row overflow-hidden" style={BANNER} accessible={false} importantForAccessibility="no-hide-descendants">
            {letter ? <Text className="text-muted font-bold" style={BANNER_LETTER}>{letter}</Text> : null}
            {card.imageUrl ? <Image source={{ uri: card.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          </Box>
          <Box className="px-section pt-row">
            {p.why ? <Text className="text-text text-base font-display-semibold italic" numberOfLines={4}>“{p.why}”</Text> : null}
            <Text className={`text-muted text-xs ${p.why ? 'mt-row' : ''}`} numberOfLines={1}>{card.showTitle}</Text>
            <Text className="text-text text-sm font-bold mt-0.5" numberOfLines={3}>{card.title}</Text>
          </Box>
        </Pressable>
        <Box className="flex-row justify-end px-2 pb-2">
          <PlayButton title={card.title} onPress={() => void play(card)} />
        </Box>
      </Card>
    );
  };

  const row = (p: PastPick, i: number): React.ReactElement => {
    if (p.episode) {
      const card = p.episode;
      if (i === 0) return feature(p, card, i);
      return <EpisodeLine key={`${card.id}-${i}`} card={card} size={56} divided {...(p.why ? { line: `“${p.why}”` } : {})} onOpen={() => void open(card)} onPlay={() => void play(card)} />;
    }
    // No episode yet: the note, and the show it came from.
    return (
      <Pressable key={`${p.feedUrl}-${i}`} onPress={() => openShow(p.feedUrl)} accessibilityRole="link" accessibilityLabel={`${p.why}. Open the show`} className={`justify-center py-row ${i === 0 ? '' : 'border-t-hairline border-separator'}`} style={TAP}>
        <Text className="text-text text-body font-display-semibold italic" numberOfLines={3}>“{p.why}”</Text>
        <Text className="text-accent text-xs font-semibold mt-1">Open the show →</Text>
      </Pressable>
    );
  };

  const days = state.kind === 'ok'
    ? state.days.map((d) => ({ ...d, picks: d.picks.filter((p) => !hiddenFeeds.has(p.feedUrl)) })).filter((d) => d.picks.length > 0)
    : [];

  return (
    <>
    <PageHeader title="Past picks" />
    <Screen scroll>
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
          <Box className="flex-row items-baseline gap-2 mt-1 mb-row">
            <Text className="text-accent text-lg font-display" accessibilityRole="header">{dayTitle(d.date)}</Text>
            <Text className="text-muted text-xs">{d.picks.length === 1 ? '1 pick' : `${d.picks.length} picks`}</Text>
          </Box>
          {d.picks.map(row)}
        </Box>
      ))}
      {state.kind === 'ok' && state.next ? (
        <Pressable onPress={loadMore} accessibilityRole="button" accessibilityLabel="Show earlier days" className="items-center justify-center" style={TAP}>
          {state.more === 'loading' ? <Loader /> : <Text className="text-accent text-sm font-semibold">{state.more === 'error' ? "Couldn't load — try again" : 'Show earlier days'}</Text>}
        </Pressable>
      ) : null}
    </Screen>
    </>
  );
}
