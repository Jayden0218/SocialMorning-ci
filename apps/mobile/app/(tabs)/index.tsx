// Home, the first screen: the Moments feed or Discover, behind one switch above the bars.
/**
 * Home — the first tab and the screen the app opens on (M10, owner 2026-09-27), the Discover page
 * laid out after the reference the owner chose.
 *
 * M31 T025 (design-pulse2 `home--moments`, `discover--screen`; constitution v4.0.0): Home has two
 * views behind a "Moments | Discover" switch, a glass capsule 8 above the bars — Moments, a feed of
 * the hottest parts of episodes (`MomentsFeed`), and Discover, the page as before (`DiscoverPage`:
 * a mosaic on top, the sections under it). The choice is kept (`homeView.ts`); the first time it is
 * Moments. This file only joins the pieces (review D7: it was 453 lines): data and handlers are in
 * `useDiscoverPage`, the Moments list in `useMoments`, the drawing in the files named above.
 *
 * Kept from M5/M8/M17/M21: works signed out; the last copy shows at once and offline; pull to refresh;
 * pressing the Discover tab again scrolls to the top; every row, tile, tab and link has the name and
 * the destination it had (the action replay checks them: `scripts/action-replay.mjs`).
 */
import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback } from 'react';
import { Box } from '@/ui/lib/box';
import { useMoments } from '@/ui/discover/useMoments';
import { useDiscoverPage } from '@/ui/discover/useDiscoverPage';
import { DiscoverPage } from '@/ui/discover/DiscoverPage';
import { MomentsFeed } from '@/ui/discover/MomentsFeed';
import { TrendingHomeSwitch } from '@/ui/discover/TrendingSearch';
import { useMomentsNowBar } from '@/ui/discover/useMomentsNowBar';
import { chooseHomeView, setHomeFocused, useHomeView } from '@/ui/discover/homeView';

export default function HomeScreen(): React.ReactElement {
  const page = useDiscoverPage();
  const moments = useMoments();
  const view = useHomeView(page.stores.settings);
  const focused = useIsFocused();
  useMomentsNowBar(); // the now bar is hidden while the Moments feed is the screen in front
  // Home is "in front" while this tab is the focused screen: the Moments feed's previews and the
  // layout's now bar (hidden on Moments) both follow it.
  const refreshMoments = moments.refreshIfOld;
  useFocusEffect(useCallback(() => {
    setHomeFocused(true);
    refreshMoments();
    return () => setHomeFocused(false);
  }, [refreshMoments]));
  const choose = (next: 'moments' | 'discover'): void => chooseHomeView(page.stores.settings, next);
  return (
    <Box className="flex-1 bg-void">
      {view === 'moments' ? (
        <MomentsFeed list={moments} body={page.view?.body} inFront={focused} onDiscover={() => choose('discover')} />
      ) : (
        <DiscoverPage page={page} moments={moments} />
      )}
      <TrendingHomeSwitch hints={page.hints} view={view} onChange={choose} onSearch={page.openSearch} />
    </Box>
  );
}
