// The Discover view of Home: a Page with the hero, the shortcuts and every section, each on one heading style.
/**
 * Spec 039 (M4; `design/B-Discover.dc.html`), replacing M31 T025's mosaic, bottom title and search field. From the top: the `Page` title
 * "Discover" with Scan and Search at its right (44 each; Search is `openSearch`, as the field was); the hero (`MomentHero`, drawn from the
 * FIRST moment of the Moments list, and not at all when there are none); the shortcut tiles as "Browse" in a 2 column grid; then the
 * sections in the owner's order exactly as before (`buildModel`), each a `Section` with its cards on a `Shelf`. One left edge: the 20 gutter.
 *
 * Kept from before: the page appears whole (the loading mark until Discover and For You have both had their first answer, or
 * `FIRST_PAINT_CAP_MS`); the stale and offline notices (now an `InlineNotice` with Retry, which reads Discover and For You again).
 * Kept through `Page`'s `scroll` pass-through: the pull to refresh (the mark under the status bar, as before). Kept through `Page`'s
 * `scrollRef` and `scrollToTopOnTabPress`: the Discover tab pressed again scrolls to the top, and the Premium tile (in Browse) scrolls to
 * Premium picks. The page title keeps its spoken name "Discover, today's picks" (`titleLabel`).
 * Not kept by design: the trending hint in the search field (Search is an icon now) and Today's pick as a tile (the Picks section lists it).
 */
import { Fragment, useRef } from 'react';
import { StyleSheet, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { bars, colour, radius, spacing } from '@/design';
import { type SectionId } from '@/discover/sections';
import { Icon } from '@/ui/kit/Icon';
import { usePullRefresh } from '@/ui/kit/PullRefresh';
import { Loader } from '@/ui/kit/Loader';
import { Page, InlineNotice, Section, TileGrid } from '@/ui/kit/layout';
import { Type } from '@/ui/kit/Type';
import { RecFeedbackLink } from './RecFeedback';
import { NotInterestedSheet } from './NotInterested';
import { TreasureHunt } from './TreasureHunt';
import { TheirLikes } from './TheirLikes';
import { TopicListCards } from './TopicLists';
import { ForYouSection } from './ForYouSection';
import { PicksSection } from './PicksSection';
import { ChartSection } from './ChartSection';
import { CategoryStrip, MoreCategories } from './CategorySections';
import { PremiumSection, ShowTiles, VideoSection, popularShowTiles } from './ShowSections';
import { NewArrivalsSection, SaidSection } from './ListenerSections';
import { MomentHero } from './MomentHero';
import { useShortcutTiles } from './DiscoverShortcuts';
import type { ShortcutTile } from './DiscoverMosaic';
import { SWITCH_HEIGHT, SWITCH_LIFT } from './HomeSwitch';
import { useMomentActions } from './useMomentActions';
import type { DiscoverPageData } from './useDiscoverPage';
import type { MomentsList } from './useMoments';
import type { PickWithFaces } from '@/discover/explore-api';
import { nowMs } from '@/ui/kit/clock';

/**
 * Spec 039 Q2 (owner, 2026-11-06): the Moments | Discover switch has its own band at the foot, below the page and above the tab bar: a
 * solid void strip with a hairline on top, the switch centred with `SWITCH_LIFT` above and below it. The page ends where the band begins,
 * so nothing sits under the switch at rest and the page needs no spacer for it.
 */
export const BAND_HEIGHT = SWITCH_HEIGHT + 2 * SWITCH_LIFT;

/** The band that holds the switch (`switcher`, drawn by Home). Opaque, in the column under the page. */
function SwitchBand(props: { children?: React.ReactNode }): React.ReactElement {
  return (
    <Box
      testID="home-band"
      className="items-center justify-center"
      style={{ height: BAND_HEIGHT, backgroundColor: colour.void, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colour.line }}
    >
      {props.children}
    </Box>
  );
}

/** A 44 icon button at the right of the title. */
function IconButton(props: { icon: 'search-outline' | 'scan-outline'; label: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={props.label} className="items-center justify-center" style={{ width: bars.circle, height: bars.circle }}>
      <Icon name={props.icon} size={22} color={colour.text} />
    </Pressable>
  );
}

/** A shortcut as a tile of the Browse grid: its name (and the queue's count), on a raise card. */
export function BrowseTile(props: { tile: ShortcutTile }): React.ReactElement {
  const t = props.tile;
  return (
    <Pressable
      onPress={t.onPress}
      accessibilityRole="button"
      accessibilityLabel={t.label}
      {...(t.count !== undefined ? { accessibilityValue: { text: `${t.count} queued` } } : {})}
      className={`flex-row items-center ${t.tinted ? 'bg-hotSoft' : 'bg-raise'}`}
      style={{ minHeight: spacing.region + spacing.section, paddingHorizontal: spacing.section, paddingVertical: spacing.row, gap: spacing.row, borderRadius: radius.row }}
    >
      <Icon name={t.icon} size={22} color={colour.text} />
      <Type step="strong" className="text-text flex-1" numberOfLines={2}>
        {t.label}
        {t.count !== undefined ? <Type step="time" className="text-text3">{` ${t.count}`}</Type> : null}
      </Type>
    </Pressable>
  );
}

export function DiscoverPage(props: { page: DiscoverPageData; moments: MomentsList; switcher?: React.ReactNode }): React.ReactElement {
  const { page, moments } = props;
  const { model, act, view, refreshing, allCategories, hiddenCats, showCat, openSearch, moreFor, notInterested, shown, listener, undo } = page;
  const insets = useSafeAreaInsets();
  // The Premium tile scrolls the page to Premium picks: the section reports where it sits in the scroll content.
  const premiumY = useRef<number | undefined>(undefined);
  const toPremium = (): void => {
    if (premiumY.current === undefined) return;
    page.scroller.current?.scrollTo({ y: Math.max(0, premiumY.current - 56), animated: true });
  };
  const markPremium = (e: LayoutChangeEvent): void => { premiumY.current = e.nativeEvent.layout.y; };
  const browse = useShortcutTiles({ onCategories: page.allCategories, onPremium: toPremium });
  const pull = usePullRefresh(refreshing, () => void page.refreshBoth());
  const momentActions = useMomentActions(page.view?.body);
  // The hero is the first moment of the list as it is: nothing is ranked or invented here.
  const first = moments.items[0];

  const section = (id: SectionId): React.ReactNode => {
    switch (id) {
      case 'forYou':
        return (
          <ForYouSection
            rows={model.forYou}
            {...act}
            onOpenAt={(c, index) => {
              page.outbox.opened(index);
              void page.open(c);
            }}
            {...(listener ? { onMore: page.setMoreFor } : {})}
            {...(undo ? { hidden: { at: undo.at, kind: undo.kind, onUndo: page.undoHide } } : {})}
            // M22 US5 (FR-019): "Not liking these?" under the For You deck.
            {...(listener && model.forYou.length > 0 ? { footer: <RecFeedbackLink /> } : {})}
          />
        );
      // M25 A5: each part the owner can switch on or off on its own (Admin › Discover).
      case 'pickedShows':
        return <ShowTiles title="Shows picked for you" caption="Picked for you" shows={model.pickedShows} onShow={page.showPage} />;
      case 'picks':
        return (
          <PicksSection
            items={model.picks as PickWithFaces[]}
            {...(view?.body.date ? { date: view.body.date } : {})}
            {...act}
            onQueue={(c) => void page.queue(c)}
            onPast={() => page.router.push({ pathname: '/picks/past', params: view?.body.date ? { before: view.body.date } : {} })}
            onDaily={() => page.router.push('/picks/daily')}
          />
        );
      case 'theirLikes':
        return <TheirLikes signedIn={listener !== undefined} />;
      case 'chart':
        return <ChartSection tabs={model.chart} {...act} onFull={() => page.router.push('/chart')} />;
      case 'categories':
        return view ? (
          <CategoryStrip
            onGenre={(id) => page.router.push({ pathname: '/category/[id]', params: { id: String(id) } })}
            onAll={page.allCategories}
            hidden={page.hiddenCats}
            onHide={page.hideCat}
          />
        ) : null;
      case 'shows':
        return <ShowTiles title="Popular shows" short="Popular" shows={popularShowTiles(model.shows)} onShow={page.showPage} />;
      case 'premium':
        return (
          <Box testID="discover-premium" onLayout={markPremium}>
            <PremiumSection shows={model.premium} onShow={page.showPage} />
          </Box>
        );
      case 'video':
        return <VideoSection items={model.video} {...act} />;
      // Owner, 2026-10-05: "Shows listeners here follow" is no longer drawn. M21: the collections
      // come back only as topic-list cards, each opening its full list.
      case 'collections':
        return <TopicListCards lists={model.collections} />;
      case 'said':
        return <SaidSection items={model.said} now={nowMs()} {...act} />;
      case 'newShows':
        return <NewArrivalsSection items={model.arrivals} {...act} />;
      case 'hunt':
        return <TreasureHunt onOpen={act.onOpen} onPlay={act.onPlay} />;
    }
  };

  // Owner, 2026-10-04: the page appears whole — the loading mark until Discover and For You have
  // both had their first answer (or FIRST_PAINT_CAP_MS), then everything at once.
  if (!shown) {
    return (
      <Box className="flex-1 bg-void">
        <Box className="flex-1 items-center justify-center">
          <Loader />
        </Box>
        <SwitchBand>{props.switcher}</SwitchBand>
      </Box>
    );
  }

  return (
    <Box className="flex-1 bg-void">
      {/* The pull-to-refresh mark sits under the status bar, not behind it. */}
      <Box pointerEvents="none" className="absolute left-0 right-0" style={{ top: insets.top, height: 0, zIndex: 1 }}>{pull.backdrop}</Box>
      <Box className="flex-1">
      <Page
        title="Discover"
        titleLabel="Discover, today's picks"
        tabs
        scrollToTopOnTabPress
        scrollRef={page.scroller}
        scroll={{ refreshControl: pull.refreshControl, onScroll: pull.onScroll, scrollEventThrottle: pull.scrollEventThrottle }}
        trailing={
          <Box className="flex-row items-center">
            <IconButton icon="scan-outline" label="Scan a QR code" onPress={() => page.router.push('/scan')} />
            <IconButton icon="search-outline" label="Search" onPress={() => openSearch(insets.top, undefined)} />
          </Box>
        }
      >
        {view?.stale ? (
          <InlineNotice
            text={`Couldn't refresh — showing what was fetched ${view.fetchedAt ? new Date(view.fetchedAt).toLocaleTimeString() : 'earlier'}.`}
            actionLabel="Retry"
            onAction={() => void page.refreshBoth()}
          />
        ) : null}
        {!view ? (
          <>
            <InlineNotice text="Couldn't reach the server, and nothing is cached yet." actionLabel="Retry" onAction={() => void page.refreshBoth()} />
            {refreshing ? <Loader /> : null}
          </>
        ) : null}
        {view ? pull.inline : null}
        {first ? <MomentHero moment={first} onPlay={momentActions.playFull} /> : null}
        {browse.length > 0 ? (
          <Section title="Browse">
            <TileGrid>
              {browse.map((t) => <BrowseTile key={t.label} tile={t} />)}
            </TileGrid>
          </Section>
        ) : null}

        {/* M15 US5: the owner's order, hidden sections left out (`buildModel`). M25 A5: the
            category strip is a section of its own ("categories"), right after the chart by default. */}
        {model.order.map((id) => (
          <Fragment key={id}>{section(id)}</Fragment>
        ))}
        {view ? <MoreCategories onPress={allCategories} hidden={hiddenCats} onShow={showCat} /> : null}
      </Page>
      </Box>
      <SwitchBand>{props.switcher}</SwitchBand>
      <NotInterestedSheet card={moreFor} onChoose={notInterested} onClose={() => page.setMoreFor(undefined)} />
    </Box>
  );
}
