// Plays your next queued or newest episode and opens the player.
/**
 * `socialmorning://play-latest` (M10b US9) — what Siri's "Play my latest SocialNet episode"
 * opens: the first unfinished episode in the queue, else the newest in Updates. It plays and
 * goes to the player; with nothing to play it says so.
 *
 * Spec 039 (Detail template): a `DetailPage` (Back + "Play latest"); the empty state is a block in the page's flow (the grey glow and the 240 offset are gone).
 *
 * M31 W5-D (T064; design-pulse2 `discover.html` `play-latest--screen`, layout pattern Stage): a pushed page with the title bar low
 * ("Play latest"), a grey glow behind, and in the page's middle (240 from the top) a flat curve (30 bars, 30 tall, 200 wide, the line
 * colour), "Nothing new to play" in Unbounded 800 34 and "Follow a show or add to your queue." in Geist 500 17/24, text2. With
 * something to play the page shows "Starting…" and the player opens; back leaves. Behaviour unchanged.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Box } from '@/ui/lib/box';
import { Curve } from '@/ui/kit/Curve';
import { DetailPage } from '@/ui/detail/DetailPage';
import { spacing } from '@/design';
import { Type } from '@/ui/kit/Type';
import { latestToPlay } from '@/outside/now-playing';
import { usePlayer } from '@/playback/store';
import { useSafety } from '@/safety/context';
import { toPlayable } from '@/storage/playable';
import { useStores } from '@/ui/shell/providers';

const NONE: readonly number[] = [];

export default function PlayLatest(): React.ReactElement {
  const stores = useStores();
  const player = usePlayer();
  const { hiddenFeeds } = useSafety();
  const [nothing, setNothing] = useState(false);
  useEffect(() => {
    const id = latestToPlay(stores, hiddenFeeds);
    const playable = id ? toPlayable(stores, id) : undefined;
    if (!playable) { setNothing(true); return; }
    player.load(playable, 'play');
    router.replace('/player');
  }, [stores, player, hiddenFeeds]);
  return (
    <DetailPage title="Play latest">
      {nothing ? (
        <Box testID="play-latest-nothing" style={{ gap: spacing.section }} accessible accessibilityLiveRegion="polite" accessibilityLabel="Nothing new to play — follow a show or add to your queue.">
          <Box style={{ width: 200 }} accessible={false} importantForAccessibility="no-hide-descendants"><Curve data={NONE} count={30} height={30} min={30} flat /></Box>
          <Type step="title" className="text-text" accessibilityRole="header">Nothing new to play</Type>
          <Type step="body" className="text-text2">Follow a show or add to your queue.</Type>
        </Box>
      ) : <Type step="body" className="text-text2">Starting…</Type>}
    </DetailPage>
  );
}
