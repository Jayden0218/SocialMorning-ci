// Tips you gave to shows; today says tipping is not available yet.
/**
 * Tips I gave (M12 FR-105): each tip's show, amount and date — store-verified purchases only.
 * Until the store setup (M10b) is done nothing can be bought, and the page says so.
 *
 * M17 (`Tips-B`, constitution v3.0.0): the page's name moves into the bar, small and centred;
 * an empty list is a tilted yellow tile with the heart, "No tips yet" as a large serif headline
 * and, while the store is not set up, the same "not available yet" sentence under it. Real tips
 * (none today) are white cards. Loading, the error line and the data are unchanged.
 *
 * M31 W6-A (T070 part 1; design-pulse2 `shell.html` `tips--screen`; layout Stage): the glow behind (hot first, 50 %); a faint wall of 60 bars; a 160 heart tile
 * (hot to violet, tilted 6 degrees left, glowing) 100 under the status bar; "No tips yet" in Unbounded 800 40 and, while the store is not set up, the
 * not-available sentence (15, text-2) low on the page, 110 over the title bar; the title bar is low with "Tips I gave" at 20 (the headline already says what the
 * page is) and back only. Tips, when there are any, are 64 tiles (show, date, amount in mono) ending with the end-of-list mark, with the not-available caption
 * above them while the store is not set up; loading is ghost rows; a load error is the line "Couldn't load your tips right now.". Same call, names and words.
 */
import { useLoad } from '@/ui/kit/useLoad';
import { FlatList } from '@/ui/lib/flat-list';
import { Box } from '@/ui/lib/box';
import { EndOfList } from '@/ui/kit/EndOfList';
import { PageGlow } from '@/ui/kit/PageGlow';
import { PushedPage } from '@/ui/kit/PushedPage';
import { useM12Api } from '@/social/m12-api';
import { GlowTile } from '@/ui/me/lists';
import { InfoGhost } from '@/ui/show/InfoGroup';
import { TipsWall, TipTile, TIPS_SIDE } from '@/ui/tips/parts';
import { TIPS } from '@/ui/wallet/measures';
import { Big, Line } from '@/ui/wallet/stage';

const NOT_READY = 'Tipping is not available yet. When it is, tips are paid through the App Store or Google Play.';

export default function TipsScreen(): React.ReactElement {
  const m12 = useM12Api();
  // M23 US9: cancelled on unmount.
  const [state] = useLoad(() => m12.tips(), [m12], 'tips.load');
  const notReady = state.kind === 'ok' && !state.storeReady;
  const empty = state.kind === 'ok' && state.items.length === 0;
  return (
    <PushedPage title="Tips I gave" size={TIPS.titleSize} tone="none">
      {(layout) => (
        <>
          <PageGlow top={TIPS.glowTop} strength={TIPS.glowStrength} />
          {empty ? (
            <>
              <TipsWall top={layout.top + TIPS.wallTop} />
              <Box testID="tips-tile" className="absolute left-0 right-0 items-center" pointerEvents="none" style={{ top: layout.top + TIPS.tileTop }}><GlowTile icon="heart-outline" size={TIPS.tile} rotate={TIPS.tileRotate} /></Box>
              <Box testID="tips-words" className="absolute" style={{ left: TIPS_SIDE, right: TIPS_SIDE, bottom: layout.titleBottom + TIPS.wordsAbove, gap: TIPS.wordsGap }} accessible accessibilityLabel={notReady ? `No tips yet. ${NOT_READY}` : 'No tips yet'}>
                <Big size="big40">No tips yet</Big>
                {notReady ? <Line size="line15">{NOT_READY}</Line> : null}
              </Box>
            </>
          ) : (
            <FlatList
              className="flex-1"
              data={state.kind === 'ok' ? state.items : []}
              // Owner, 2026-10-05: the bottom of a fetched list says so.
              ListFooterComponent={state.kind === 'ok' && state.items.length > 0 ? <EndOfList /> : undefined}
              keyExtractor={(t) => t.id}
              contentContainerStyle={{ paddingTop: layout.top + TIPS.listTop, paddingHorizontal: TIPS_SIDE, paddingBottom: layout.reserve, flexGrow: 1 }}
              ListHeaderComponent={state.kind === 'ok' && !state.storeReady && state.items.length > 0 ? <Box style={{ marginBottom: TIPS.listGap }}><Line size="line13" tone="text3">{NOT_READY}</Line></Box> : undefined}
              ListEmptyComponent={state.kind === 'loading' ? <Box testID="tips-loading" style={{ opacity: 0.55 }}><InfoGhost rows={5} /></Box> : state.kind === 'error' ? <Line size="line14">Couldn't load your tips right now.</Line> : undefined}
              renderItem={({ item }) => <TipTile tip={item} />}
            />
          )}
        </>
      )}
    </PushedPage>
  );
}
