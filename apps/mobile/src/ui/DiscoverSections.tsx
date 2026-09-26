/** Discover's three sections (M5 US1), reused by the Discover screen and the zero-subscription home. */
import { Text, View } from 'react-native';
import type { Discover, EpisodeCard } from '../social/api';
import { PickCard } from './PickCard';
import { EpisodeRow } from './EpisodeRow';

export function DiscoverSections(props: { body: Discover; stale: boolean; fetchedAt?: number; onOpen: (card: EpisodeCard) => void; maxPicks?: number }): React.ReactElement {
  const { body } = props;
  const picks = props.maxPicks !== undefined ? body.picks.slice(0, props.maxPicks) : body.picks;
  return (
    <View className="gap-1.5">
      {props.stale ? <Text className="text-accent bg-surface p-2 rounded-md">Couldn't refresh — showing what was fetched {props.fetchedAt ? new Date(props.fetchedAt).toLocaleTimeString() : 'earlier'}.</Text> : null}
      <Text className="text-[18px] font-semibold mt-3 mb-1 text-text">{body.date ? `Picks for ${body.date}` : "Today's picks"}</Text>
      {picks.length === 0 ? <Text className="text-muted">No picks yet.</Text> : picks.map((p) => <PickCard key={p.key} item={p} onPress={() => props.onOpen(p.episode)} />)}
      {props.maxPicks === undefined ? (
        <>
          <Text className="text-[18px] font-semibold mt-3 mb-1 text-text">Listened and talked about</Text>
          {body.talkedAbout.length === 0 ? <Text className="text-muted">Nothing yet — you could be first.</Text> : body.talkedAbout.map((i) => <EpisodeRow key={i.key} card={i.episode} line={i.reason} onPress={() => props.onOpen(i.episode)} />)}
          {body.trending.length > 0 ? (
            <>
              <Text className="text-[18px] font-semibold mt-3 mb-1 text-text">Trending on the chart</Text>
              <Text className="text-muted">From the public podcast chart, not from listeners here.</Text>
              {body.trending.map((i) => <EpisodeRow key={i.key} card={i.episode} onPress={() => props.onOpen(i.episode)} />)}
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
