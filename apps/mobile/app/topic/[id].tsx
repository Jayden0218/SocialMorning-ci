// One topic list in full: every episode the editors put in it, with its note.
/**
 * M21 US7 (T082): the page a topic-list card on Discover opens. The list comes from the
 * Discover copy already on the phone (no extra call), so it opens at once and offline.
 *
 * M31 W5-D (T064; design-pulse2 `discover.html` `topic--screen`, layout pattern Deck): a pushed page with the list's title (26) and
 * subtitle low, a blue-to-violet glow behind, and the episodes as a Deck under the edge label EPISODES: cards 290 x 430, numbered in
 * the editors' order — the cover (200) with the number in Unbounded 800 28 over its corner, then the editors' note in quotes (Unbounded 600 15),
 * the show, the title (Unbounded 700, one line), the heat curve and the Play disc (42). A card opens the episode; Play plays it.
 * Without the list on the phone: "This list is not on the phone yet — open Discover first" and the title "Topic list".
 */
import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { Curve } from '@/ui/kit/Curve';
import { EndOfList } from '@/ui/kit/EndOfList';
import { createDiscover } from '@/discover/cache';
import { useCardActions } from '@/discover/useDiscover';
import { useSafety } from '@/safety/context';
import { useSocial } from '@/social/context';
import { useStores } from '@/ui/shell/providers';
import { CoverBand, DECK, Deck, DeckCard, DeckSection, DiscPlay } from '@/ui/discover/Deck';
import { PAGE, PAGE_TYPE } from '@/ui/discover/measures';
import { useEpisodeHeat } from '@/ui/discover/useEpisodeHeat';
import { bodyTop } from '@/ui/discover/page-parts';
import { DRAWN, emptyTop, PageEmpty } from '@/ui/me/lists';
import type { DiscoverItem } from '@/social/api';
import { nowMs as clockMs } from '@/ui/kit/clock';

const NO_HEAT: readonly number[] = Array.from({ length: 100 }, () => 0);

function TopicCard(props: { item: DiscoverItem; n: number; onOpen: () => void; onPlay: () => void }): React.ReactElement {
  const { item } = props;
  const heat = useEpisodeHeat(item.episode.id, true);
  return (
    <DeckCard>
      <Pressable onPress={props.onOpen} accessibilityRole="button" accessibilityLabel={`${item.episode.title}, ${item.episode.showTitle}`} style={{ height: PAGE.topic.cover }}>
        <CoverBand url={item.episode.imageUrl} name={item.episode.showTitle} height={PAGE.topic.cover} />
        <Type step="hero" className="text-text absolute" style={[PAGE_TYPE.rank30, { left: DECK.pad - 2, top: DECK.pad - 2 }]}>{String(props.n)}</Type>
      </Pressable>
      <Box className="flex-1" style={{ padding: DECK.pad, gap: PAGE.gap - 2 }}>
        {item.why ? <Type step="lede" className="text-text" style={PAGE_TYPE.note15} numberOfLines={4}>{`“${item.why}”`}</Type> : null}
        <Type step="caption" className="text-text2" numberOfLines={1}>{item.episode.showTitle}</Type>
        <Type step="lede" className="text-text" style={PAGE_TYPE.tile14} numberOfLines={1}>{item.episode.title}</Type>
        <Box className="flex-row items-center mt-auto" style={{ gap: PAGE.gap - 2 }}>
          <Box className="flex-1"><Curve data={heat.buckets ?? NO_HEAT} count={40} height={24} min={2} played={heat.buckets ? 1 : 0} flat={heat.buckets === undefined} /></Box>
          <DiscPlay size={42} title={item.episode.title} onPress={props.onPlay} />
        </Box>
      </Box>
    </DeckCard>
  );
}

export default function TopicListScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSocial();
  const stores = useStores();
  const { hiddenFeeds } = useSafety();
  const { open, play } = useCardActions();
  const list = useMemo(() => {
    const view = createDiscover({ api, cache: stores.feedCache, now: clockMs }).cached();
    return view?.body.collections?.find((c) => c.id === id);
  }, [api, stores, id]);
  const items = (list?.items ?? []).filter((i) => !hiddenFeeds.has(i.episode.feedUrl));
  return (
    <PushedPage title={list?.title ?? 'Topic list'} size={26} {...(list?.subtitle ? { subtitle: list.subtitle } : {})} tone="blue">
      {(layout) => (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: bodyTop(layout, PAGE.body70), paddingBottom: layout.reserve }}>
            {items.length === 0 ? (
              <PageEmpty top={emptyTop(250) - (PAGE.body70 - DRAWN.listTop)} title="This list is not on the phone yet — open Discover first" />
            ) : (
              <DeckSection label="Episodes">
                <Deck width={PAGE.topic.width} height={PAGE.topic.height} accessibilityLabel="Episodes">
                  {items.map((item, i) => (
                    <TopicCard key={item.key} item={item} n={i + 1} onOpen={() => void open(item.episode)} onPlay={() => void play(item.episode)} />
                  ))}
                </Deck>
              </DeckSection>
            )}
            {items.length > 0 ? <EndOfList /> : null}
        </ScrollView>
      )}
    </PushedPage>
  );
}
