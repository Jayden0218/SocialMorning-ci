/**
 * `socialmorning://play-latest` (M10b US9) — what Siri's "Play my latest SocialNet episode"
 * opens: the first unfinished episode in the queue, else the newest in Updates. It plays and
 * goes to the player; with nothing to play it says so.
 *
 * M17 T054 (`PlayLatest-B`): the back row alone (no big page title), then a picture of three
 * fanned tiles with a play disc, and the app's own sentence split into a serif headline and a
 * muted line under it. Behaviour unchanged.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from '../src/ui/lib/text';
import { Box } from '../src/ui/lib/box';
import { Icon } from '../src/ui/Icon';
import { latestToPlay } from '../src/outside/now-playing';
import { usePlayer } from '../src/playback/store';
import { useSafety } from '../src/safety/context';
import { toPlayable } from '../src/storage/playable';
import { useStores } from '../src/ui/providers';
import { useColours } from '../src/ui/useColours';
import { PageHeader } from '../src/ui/PageHeader';

/** The picture's tiles: size, place and tilt are layout, so they stay styles. */
const TILE = 170;
const BACK = { width: TILE, height: TILE, left: 30, top: 30, transform: [{ rotate: '-8deg' }] };
const MIDDLE = { width: TILE, height: TILE, left: 70, top: 44, transform: [{ rotate: '4deg' }] };
const FRONT = { width: TILE, height: TILE, left: 48, top: 58, transform: [{ rotate: '-2deg' }] };
const DISC = { width: 64, height: 64, left: 48 + TILE / 2 - 32, top: 58 + TILE / 2 - 32 };
const PICTURE = { width: 290, height: 270 };

export default function PlayLatest(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
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
    <>
    {/* B draws no page title here: an empty `middle` keeps the back row and drops the title. */}
    <PageHeader title="Play latest" middle={<Box />} />
    <Box className="flex-1 bg-background px-7">
      {nothing ? (
        <>
          <Box className="self-center mt-5 mb-2.5" style={PICTURE} accessible={false}>
            <Box className="absolute rounded-artwork-lg bg-primary opacity-30" style={BACK} />
            <Box className="absolute rounded-artwork-lg bg-track" style={MIDDLE} />
            <Box className="absolute rounded-artwork-lg bg-accentTint border border-border" style={FRONT} />
            <Box className="absolute rounded-pill bg-surface border border-border items-center justify-center" style={DISC}>
              <Icon name="play" size={26} color={c.muted} />
            </Box>
          </Box>
          <Box accessible accessibilityLiveRegion="polite" accessibilityLabel="Nothing new to play — follow a show or add to your queue">
            <Text className="text-text text-display font-display" accessibilityRole="header">Nothing new to play</Text>
            <Text className="text-muted text-title mt-3.5">Follow a show or add to your queue.</Text>
          </Box>
        </>
      ) : <Text className="text-muted text-sm py-section">Starting…</Text>}
    </Box>
    </>
  );
}
