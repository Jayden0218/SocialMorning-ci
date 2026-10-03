/**
 * Discover's three sections (M5 US1), reused by the Discover screen and the zero-subscription home.
 *
 * M17 (`Discover-B`): serif section titles, the stale notice and each pick as bordered white
 * cards (`PickCard`), episode lists inside a card. Props unchanged — the Updates tab renders it.
 */
import { Text } from './lib/text';
import { Box } from './lib/box';
import type { Discover, EpisodeCard } from '../social/api';
import { Card } from './Card';
import { PickCard } from './PickCard';
import { EpisodeRow } from './EpisodeRow';

const TITLE = 'text-text text-lg font-display mt-section mb-1';

export function DiscoverSections(props: { body: Discover; stale: boolean; fetchedAt?: number; onOpen: (card: EpisodeCard) => void; maxPicks?: number }): React.ReactElement {
  const { body } = props;
  const picks = props.maxPicks !== undefined ? body.picks.slice(0, props.maxPicks) : body.picks;
  return (
    <Box className="gap-gap">
      {props.stale ? <Text className="text-accent text-body bg-surface border border-border p-row rounded-row">Couldn't refresh — showing what was fetched {props.fetchedAt ? new Date(props.fetchedAt).toLocaleTimeString() : 'earlier'}.</Text> : null}
      <Text className={TITLE} accessibilityRole="header">{body.date ? `Picks for ${body.date}` : "Today's picks"}</Text>
      {picks.length === 0 ? <Text className="text-muted text-body">No picks yet.</Text> : picks.map((p) => <PickCard key={p.key} item={p} onPress={() => props.onOpen(p.episode)} />)}
      {props.maxPicks === undefined ? (
        <>
          <Text className={TITLE} accessibilityRole="header">Listened and talked about</Text>
          {body.talkedAbout.length === 0 ? <Text className="text-muted text-body">Nothing yet — you could be first.</Text> : (
            <Card>{body.talkedAbout.map((i) => <EpisodeRow key={i.key} card={i.episode} line={i.reason} onPress={() => props.onOpen(i.episode)} />)}</Card>
          )}
          {body.trending.length > 0 ? (
            <>
              <Text className={TITLE} accessibilityRole="header">Trending on the chart</Text>
              <Text className="text-muted text-body">From the public podcast chart, not from listeners here.</Text>
              <Card>{body.trending.map((i) => <EpisodeRow key={i.key} card={i.episode} onPress={() => props.onOpen(i.episode)} />)}</Card>
            </>
          ) : null}
        </>
      ) : null}
    </Box>
  );
}
