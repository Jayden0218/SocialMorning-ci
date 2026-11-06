// Today's editor's picks on a page of their own, each with the editor's note.
/**
 * M21 US7 (T084, FR-062): Daily picks — today's picks (`GET /v1/discover/daily`), the note in
 * full under each, Play and + (queue) on every one. "Past picks" leads to the earlier days.
 * A pick whose episode the server cannot name yet opens its show instead.
 *
 * M22 US16: on a tablet (`useOpensInPane`) a pick opens its episode in the right pane
 * (src/ui/shell/ListDetail.tsx); a phone pushes the episode page as before.
 *
 * M31 W5-D (T064; design-pulse2 `discover.html` `picks-daily--screen`, `picks-daily--error`, layout pattern Deck): a pushed page, the title bar low
 * ("Daily picks", the date, a clock circle = Past picks) over the hot glow, and under the heading TODAY a Deck of cards 290 x 470: the
 * cover (240) with "Show · Open the show ›" in hot-text at its foot, the editor's whole note in Unbounded 600 17/24, the title (Unbounded 700,
 * one line) and at the foot the length in mono, + (ring, 42) and Play (42). The deck ends in a dashed "Past picks ›" card. A pick with no episode
 * yet keeps its note and opens the show. A failed load is the error tile with Retry (Past picks stays in the title bar); empty says "No picks today yet".
 *
 * Spec 039 (Feed lane, design B): a `FeedScroll` (Back + title + the clock circle); "Today" is a `Section` heading (no edge label) over the same Deck, whose first
 * card starts on the 20 gutter and runs off the right edge (`lead`); a failed load is an `InlineNotice` with Retry; empty is the empty block.
 */
import { useLoad } from '@/ui/kit/useLoad';
import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { useWindowDimensions } from 'react-native';
import { bars, colour, gutter } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { Loader } from '@/ui/kit/Loader';
import { InlineNotice, Section } from '@/ui/kit/layout';
import { FeedEmpty, FeedScroll } from '@/ui/feed/FeedPage';
import { Type } from '@/ui/kit/Type';
import { minutesLabel } from '@/ui/kit/format';
import { dayTitle } from '@/discover/sections';
import { useCardActions } from '@/discover/useDiscover';
import { useSafety } from '@/safety/context';
import { useExploreApi, type DailyPick } from '@/discover/explore-api';
import { EpisodePane, ListDetail, useOpensInPane } from '@/ui/shell/ListDetail';
import { CoverBand, DECK, Deck, DeckCard, DiscPlay, RingAdd } from '@/ui/discover/Deck';
import { PAGE, PAGE_TYPE } from '@/ui/discover/measures';

export default function DailyPicksScreen(): React.ReactElement {
  const api = useExploreApi();
  const { open, play, queue } = useCardActions();
  const { hiddenFeeds } = useSafety();
  // M23 US9: cancelled on unmount; only the newest answer lands.
  const [state, load] = useLoad(() => api.daily().then((daily) => ({ daily })), [api], 'picks.daily');
  const daily = state.kind === 'ok' ? state.daily : undefined;
  const items = (daily?.items ?? []).filter((p) => !hiddenFeeds.has(p.feedUrl));
  const side = gutter(useWindowDimensions().width);
  const inPane = useOpensInPane();
  const [paneId, setPaneId] = useState<string | undefined>(undefined);
  const pane = inPane ? setPaneId : undefined;
  const past = (): void => { router.push({ pathname: '/picks/past', params: daily?.date ? { before: daily.date } : {} }); };

  const card = (item: DailyPick): React.ReactElement => {
    const ep = item.episode;
    return (
      <DeckCard>
        <Box style={{ height: PAGE.daily.cover }}>
          {ep ? (
            <Pressable onPress={() => void open(ep, pane)} accessibilityRole="button" accessibilityLabel={`${ep.title}, ${ep.showTitle}`} className="flex-1">
              <CoverBand url={ep.imageUrl} name={ep.showTitle} height={PAGE.daily.cover} />
            </Pressable>
          ) : <CoverBand name={item.feedUrl} height={PAGE.daily.cover} />}
          <Pressable
            onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(item.feedUrl) } })}
            accessibilityRole="link"
            accessibilityLabel="Open the show"
            className="absolute"
            style={{ left: DECK.pad, bottom: 0, minHeight: bars.circle, paddingBottom: PAGE.gap, justifyContent: 'flex-end' }}
            hitSlop={PAGE.gap}
          >
            <Type step="caption" className="text-hotText font-semibold" numberOfLines={1}>{`${ep ? `${ep.showTitle} · ` : ''}Open the show ›`}</Type>
          </Pressable>
        </Box>
        <Box className="flex-1" style={{ padding: DECK.pad, gap: PAGE.gap }}>
          <Type step="lede" className="text-text" style={PAGE_TYPE.quote17} numberOfLines={6}>{`“${item.why}”`}</Type>
          {ep ? <Type step="lede" className="text-text" style={PAGE_TYPE.note15} numberOfLines={1}>{ep.title}</Type> : null}
          {ep ? (
            <Box className="flex-row items-center mt-auto" style={{ gap: 8 }}>
              <Type step="tag" className="text-text3 flex-1" style={PAGE_TYPE.mono11}>{minutesLabel(ep.durationMs)}</Type>
              <RingAdd size={42} title={ep.title} onPress={() => ep && void queue(ep)} />
              <DiscPlay size={42} title={ep.title} onPress={() => void play(ep)} />
            </Box>
          ) : null}
        </Box>
      </DeckCard>
    );
  };

  return (
    <ListDetail
      placeholder="Choose an episode to see it here."
      detail={paneId !== undefined ? <EpisodePane episodeId={paneId} onOpenPage={() => router.push({ pathname: '/episode/[id]', params: { id: paneId } })} /> : undefined}
      list={
        <FeedScroll
          title="Daily picks"
          {...(daily?.date ? { subtitle: dayTitle(daily.date) } : {})}
          actions={[{ icon: 'time-outline', label: 'Past picks', onPress: past }]}
        >
          {state.kind === 'loading' ? <Loader className="my-section" /> : null}
          {state.kind === 'error' ? <InlineNotice text="Couldn't load today's picks." actionLabel="Retry" onAction={load} /> : null}
          {state.kind === 'ok' && items.length === 0 ? <FeedEmpty title="No picks today yet" /> : null}
          {items.length > 0 ? (
            <Section title="Today">
              <Box style={{ marginHorizontal: -side }}>
                <Deck width={PAGE.daily.width} height={PAGE.daily.height} lead={side} accessibilityLabel="Today's picks">
                  {[
                    ...items.map((item, i) => <Box key={`${item.feedUrl}#${item.guid ?? i}`} className="flex-1">{card(item)}</Box>),
                    <DeckCard key="past" tone="dashed">
                      <Pressable onPress={past} accessibilityRole="link" accessibilityLabel="Past picks" className="flex-1 items-center justify-center" style={{ gap: PAGE.gap }}>
                        <Icon name="time-outline" size={30} color={colour.text} />
                        <Type step="lede" className="text-text" numberOfLines={1}>Past picks ›</Type>
                      </Pressable>
                    </DeckCard>,
                  ]}
                </Deck>
              </Box>
            </Section>
          ) : null}
        </FeedScroll>
      }
    />
  );
}
