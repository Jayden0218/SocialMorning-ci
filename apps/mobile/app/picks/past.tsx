// Editor's picks from earlier days, grouped by date, with notes and Play.
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
 * Before spec 039 (the page as M31 drew it, with a spine; the Spec 039 paragraph below is what the page is now) — M31 W5-D (T064; design-pulse2 `discover.html` `picks-past--screen`, `picks-past--error`, layout pattern Thread): a pushed page, the title bar low
 * ("Past picks", "Every day the editors picked"). The days hang from a spine at x 44: the date as a solid hot chip on it with "2 picks" in mono,
 * and each pick a raise card 46 in (radius 18, 12 of padding): the cover (56) with the show's first letter over it, the note in italics
 * (Geist 13/18), the show, the title (one line) and Play (34). A pick with no episode is a note card that says "Open the show ›". At the spine's
 * end "Show earlier days" (quiet, 40), or "Couldn't load — try again". A failed first load is the error tile with Retry; empty, "No earlier picks yet".
 *
 * M22 US16: on a tablet (`useOpensInPane`) a pick opens its episode in the right pane
 * (src/ui/shell/ListDetail.tsx); a phone pushes the episode page as before.
 *
 * Spec 039 (Feed lane, design B): a `FeedPage`; a day is a small caps heading (the date, "2 picks") over its cards, one card per pick (the cover with the show's
 * first letter, the note, the show, the title, Play); no spine, no chip. "Show earlier days" closes the list. A failed load is an `InlineNotice` with Retry.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Loader } from '@/ui/kit/Loader';
import { InlineNotice } from '@/ui/kit/layout';
import { FeedEmpty, FeedPage } from '@/ui/feed/FeedPage';
import { Day } from '@/ui/notifications/cards';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { initialOf } from '@/ui/kit/Artwork';
import { useCardActions } from '@/discover/useDiscover';
import { dayTitle } from '@/discover/sections';
import { useSafety } from '@/safety/context';
import type { EpisodeCard } from '@/social/api';
import { useM12Api, type PastPick, type PastPicksDay } from '@/social/m12-api';
import { EpisodePane, ListDetail, useOpensInPane } from '@/ui/shell/ListDetail';
import { radius, spacing } from '@/design';
import { CoverBand, DiscPlay } from '@/ui/discover/Deck';
import { PAGE, PAGE_TYPE } from '@/ui/discover/measures';

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

  const inPane = useOpensInPane();
  const [paneId, setPaneId] = useState<string | undefined>(undefined);
  const pane = inPane ? setPaneId : undefined;
  const openShow = (feedUrl: string) => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(feedUrl) } });

  /** A pick with an episode: the cover with the show's first letter, the note, the show, the title, Play. */
  const withEpisode = (p: PastPick, card: EpisodeCard, i: number): React.ReactElement => (
    <Box key={`${card.id}-${i}`} testID="past-pick" className="flex-row items-center bg-raise" style={{ borderRadius: radius.card, padding: spacing.section, gap: spacing.row }}>
      <Pressable onPress={() => void open(card, pane)} accessibilityRole="button" accessibilityLabel={`${card.title}, ${card.showTitle}`} className="flex-1 flex-row items-center min-w-0" style={{ gap: PAGE.card.issue.pad }}>
        <Box style={{ width: 56, height: 56 }} accessible={false} importantForAccessibility="no-hide-descendants">
          <CoverBand url={card.imageUrl} name={card.showTitle} height={56} width={56} />
          <Box className="absolute inset-0 items-center justify-center">
            <Type step="hero" className="text-text" style={[PAGE_TYPE.letter22, { opacity: 0.8 }]}>{initialOf(card.showTitle)}</Type>
          </Box>
        </Box>
        <Box className="flex-1 min-w-0">
          {p.why ? <Type step="caption" className="text-quote italic" numberOfLines={3}>{`“${p.why}”`}</Type> : null}
          <Type step="caption" className="text-text2" style={PAGE_TYPE.small12} numberOfLines={1}>{card.showTitle}</Type>
          <Type step="compact" className="text-text font-bold" numberOfLines={1}>{card.title}</Type>
        </Box>
      </Pressable>
      <DiscPlay size={34} title={card.title} onPress={() => void play(card)} />
    </Box>
  );

  /** No episode yet: the note, and the show it came from. */
  const noteCard = (p: PastPick, i: number): React.ReactElement => (
    <Pressable key={`${p.feedUrl}-${i}`} onPress={() => openShow(p.feedUrl)} accessibilityRole="link" accessibilityLabel={`${p.why}. Open the show`} className="bg-raise" style={{ borderRadius: radius.card, padding: spacing.section, gap: spacing.hair }}>
      <Type step="caption" className="text-quote italic" numberOfLines={4}>{`“${p.why}”`}</Type>
      <Type step="caption" className="text-hotText font-semibold">Open the show ›</Type>
    </Pressable>
  );

  const days = state.kind === 'ok'
    ? state.days.map((d) => ({ ...d, picks: d.picks.filter((p) => !hiddenFeeds.has(p.feedUrl)) })).filter((d) => d.picks.length > 0)
    : [];

  const empty = state.kind === 'loading' ? <Loader className="my-section" />
    : state.kind === 'ok' && days.length === 0 ? <FeedEmpty title="No earlier picks yet" />
      : undefined;

  return (
    <ListDetail
      placeholder="Choose an episode to see it here."
      detail={paneId !== undefined ? <EpisodePane episodeId={paneId} onOpenPage={() => router.push({ pathname: '/episode/[id]', params: { id: paneId } })} /> : undefined}
      list={
        <FeedPage<(typeof days)[number]>
          title="Past picks"
          subtitle="Every day the editors picked"
          data={days}
          keyExtractor={(d) => d.date}
          contentStyle={{ flexGrow: 1 }}
          ListHeaderComponent={state.kind === 'error' ? <InlineNotice text="Couldn't load past picks right now." actionLabel="Retry" onAction={first} /> : null}
          ListEmptyComponent={empty}
          ListFooterComponent={state.kind === 'ok' && state.next ? (
            <Box testID="past-thread" style={{ alignItems: 'flex-start' }}>
              {state.more === 'loading' ? <Loader /> : <PulseButton kind="quiet" height={40} label={state.more === 'error' ? "Couldn't load — try again" : 'Show earlier days'} accessibilityLabel="Show earlier days" onPress={loadMore} />}
            </Box>
          ) : undefined}
          renderItem={({ item: d }) => (
            <Day label={`${dayTitle(d.date).replace(/ \d{4}$/, '')} · ${d.picks.length === 1 ? '1 pick' : `${d.picks.length} picks`}`}>
              <Box style={{ gap: spacing.row }}>
                {d.picks.map((p, i) => (p.episode ? withEpisode(p, p.episode, i) : noteCard(p, i)))}
              </Box>
            </Day>
          )}
        />
      }
    />
  );
}
