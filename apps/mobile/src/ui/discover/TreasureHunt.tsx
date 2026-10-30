// Treasure hunt on Discover: three lesser-heard episodes from shows you don't follow, with Shuffle.
/**
 * M21 US7 (T083). OUR OWN DESIGN (owner, 2026-10-06) — 小宇宙's behaviour here was never
 * observed in detail, so this is not a copy. The server picks 3 lesser-heard episodes a day from
 * shows the listener does not follow and did not turn down (`GET /v1/discover/hunt`); the same
 * three show all day. Shuffle asks for the next set. Each card opens the episode; Play plays it.
 * No data (offline, or nothing to offer) → no section, like every Discover section.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Card } from '@/ui/kit/Card';
import { Icon } from '@/ui/kit/Icon';
import { useColours } from '@/ui/kit/useColours';
import { useStores } from '@/ui/shell/providers';
import { useExploreApi, type Hunt } from '@/discover/explore-api';
import type { EpisodeCard } from '@/social/api';
import { PlayButton, SectionTitle } from './parts';

const TAP = { minHeight: hit.min, minWidth: hit.min };

export function TreasureHunt(props: { onOpen: (card: EpisodeCard) => void; onPlay: (card: EpisodeCard) => void }): React.ReactElement | null {
  const api = useExploreApi();
  const stores = useStores();
  const c = useColours(stores.settings);
  const [shuffle, setShuffle] = useState(0);
  const [hunt, setHunt] = useState<Hunt | undefined>();
  const [busy, setBusy] = useState(false);
  const load = useCallback((n: number) => {
    setBusy(true);
    api.hunt(n).then((h) => setHunt(h), () => { /* keep the last set; offline shows what was there */ }).finally(() => setBusy(false));
  }, [api]);
  useEffect(() => { load(0); }, [load]);
  if (!hunt || hunt.items.length === 0) return null;
  const again = (): void => { const n = shuffle + 1; setShuffle(n); load(n); };
  return (
    <Box>
      <SectionTitle title="Treasure hunt" />
      <Text className="text-muted text-meta px-screen-x -mt-1 mb-gap">Three lesser-heard episodes from shows you don't follow. New ones every day.</Text>
      <Box className="px-screen-x gap-row">
        {hunt.items.map((e) => (
          <Card key={e.id} padded={false} className="flex-row items-center gap-row p-row">
            <Pressable onPress={() => props.onOpen(e)} accessibilityRole="button" accessibilityLabel={`${e.title}, ${e.showTitle}`} className="flex-1 flex-row items-center gap-row" style={TAP}>
              <Artwork url={e.imageUrl} size={64} name={e.showTitle} />
              <Box className="flex-1 gap-0.5">
                <Text className="text-accent text-xs font-semibold" numberOfLines={1}>{e.showTitle}</Text>
                <Text className="text-text text-body font-display-semibold" numberOfLines={2}>{e.title}</Text>
              </Box>
            </Pressable>
            <PlayButton title={e.title} onPress={() => props.onPlay(e)} />
          </Card>
        ))}
      </Box>
      <Pressable onPress={again} disabled={busy} accessibilityRole="button" accessibilityLabel="Shuffle the treasure hunt" accessibilityState={{ disabled: busy }} className={`flex-row items-center justify-center gap-2 self-center mt-row px-section rounded-pill bg-surface border border-border ${busy ? 'opacity-40' : ''}`} style={TAP}>
        <Icon name="shuffle" size={18} color={c.accent} />
        <Text className="text-text text-meta font-semibold">Shuffle</Text>
      </Pressable>
    </Box>
  );
}
