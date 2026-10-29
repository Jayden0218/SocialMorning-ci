// Discover's main sections: picks, then episode lists, with an old-data note.
/**
 * Discover's three sections (M5 US1), reused by the zero-subscription Updates tab.
 *
 * M31 D-A (T031; design-pulse2 `index.html#updates--screen` note "With no subscriptions, the deck is replaced by Discover sections, as today"):
 * each section is named by an edge label in the 28 lane, as Discover's own sections are. The picks are a Deck of cards (270 wide, snapping);
 * the two lists sit in one raise panel (radius 24, the 28 lane on the left, the gutter on the right). The stale notice is a hot-text caption.
 * Props unchanged.
 */
import { useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import type { Discover, EpisodeCard } from '@/social/api';
import { Type } from '@/ui/kit/Type';
import { EpisodeRow } from '@/ui/episode/EpisodeRow';
import { gutter, radius, spacing } from '@/design';
import { PickCard } from './PickCard';
import { DECK, Deck, DeckSection } from './Deck';

/** The pick cards: 270 wide, 150 tall (the cover row, the note). */
const PICK = { width: 270, height: 150 } as const;

function Panel(props: { children: React.ReactNode }): React.ReactElement {
  const { width } = useWindowDimensions();
  return (
    <Box className="bg-raise border border-line" style={{ marginLeft: DECK.lane, marginRight: gutter(width), borderRadius: radius.card, paddingHorizontal: spacing.section }}>
      {props.children}
    </Box>
  );
}

export function DiscoverSections(props: { body: Discover; stale: boolean; fetchedAt?: number; onOpen: (card: EpisodeCard) => void; maxPicks?: number }): React.ReactElement {
  const { body } = props;
  const { width } = useWindowDimensions();
  const picks = props.maxPicks !== undefined ? body.picks.slice(0, props.maxPicks) : body.picks;
  const line = { marginLeft: DECK.lane, marginRight: gutter(width) };
  return (
    <Box>
      {props.stale ? <Type step="caption" className="text-hotText" style={{ paddingHorizontal: gutter(width) }}>Couldn't refresh — showing what was fetched {props.fetchedAt ? new Date(props.fetchedAt).toLocaleTimeString() : 'earlier'}.</Type> : null}
      <DeckSection label="Picks" spoken={body.date ? `Picks for ${body.date}` : "Today's picks"}>
        {picks.length === 0 ? <Type step="body" className="text-text2" style={line}>No picks yet.</Type> : (
          <Deck width={PICK.width} height={PICK.height}>
            {picks.map((p) => <PickCard key={p.key} item={p} onPress={() => props.onOpen(p.episode)} />)}
          </Deck>
        )}
      </DeckSection>
      {props.maxPicks === undefined ? (
        <>
          <DeckSection label="Talked about" spoken="Listened and talked about">
            {body.talkedAbout.length === 0 ? <Type step="body" className="text-text2" style={line}>Nothing yet — you could be first.</Type> : (
              <Panel>{body.talkedAbout.map((i) => <EpisodeRow key={i.key} card={i.episode} line={i.reason} onPress={() => props.onOpen(i.episode)} />)}</Panel>
            )}
          </DeckSection>
          {body.trending.length > 0 ? (
            <DeckSection label="Trending" spoken="Trending on the chart">
              <Type step="caption" className="text-text2" style={{ ...line, paddingBottom: spacing.gap }}>From the public podcast chart, not from listeners here.</Type>
              <Panel>{body.trending.map((i) => <EpisodeRow key={i.key} card={i.episode} onPress={() => props.onOpen(i.episode)} />)}</Panel>
            </DeckSection>
          ) : null}
        </>
      ) : null}
    </Box>
  );
}
