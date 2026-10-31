// Everything Discover's page needs to know and do: its data, For You, hiding a row, categories, opening Search.
/**
 * Moved out of app/(tabs)/index.tsx (M31 T025, review D7: the screen was 453 lines holding data,
 * handlers and drawing). The hook holds the data and the handlers; `DiscoverPage` draws them.
 *
 * Kept from M5/M8: works signed out (For You simply is not there); the last copy shows at once and
 * offline, marked stale; pull to refresh; opening a card resolves it through its feed without
 * subscribing (research R8). M10: every row plays from its round button. M15 US5: a For You the owner
 * hid is not drawn, so it records no impressions either. M19 T021: "Not interested" — a row the
 * listener turned down leaves For You at once, with "Hidden · Undo" for 8 s. M21 US7: categories can be
 * hidden with × and brought back. M25 A7: the admin's search hints.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import type { ScrollView as RNScrollView } from 'react-native';
import { GENRES } from '@/discover/genres';
import { buildModel, sectionOrder } from '@/discover/sections';
import { trendingHints } from '@/config/hints';
import { useDiscover } from '@/discover/useDiscover';
import { useForYou } from '@/recs/useForYou';
import { useFirstPaint } from '@/discover/first-paint';
import { useRecOutbox } from '@/recs/useRecOutbox';
import { useSafety } from '@/safety/context';
import { useSocial } from '@/social/context';
import { useStores, useToast } from '@/ui/shell/providers';
import { useSearchOverlay } from '@/ui/search/SearchOverlay';
import { useRowStats } from '@/discover/row-stats';
import { keyFor, useDismissals } from '@/recs/dismissals';
import { hideCategory, readHiddenCategories, showCategory } from '@/discover/hidden-categories';
import { hiddenAt } from './sections-common';
import type { EpisodeCard } from '@/social/api';
import type { DismissalKind } from '@/social/profile-api';

/** M19 T021: how long "Hidden · Undo" stays under For You. */
const UNDO_MS = 8000;

export function useDiscoverPage() {
  const router = useRouter();
  const stores = useStores();
  const toast = useToast();
  const search = useSearchOverlay();
  const [hiddenCats, setHiddenCats] = useState<number[]>(() => readHiddenCategories(stores.settings));
  const { view, refreshing, refresh, open, play, queue, settled } = useDiscover();
  const { listener } = useSocial();
  const { sets, hiddenFeeds, version } = useSafety();
  const forYou = useForYou(listener !== undefined);
  // M15 US5: a For You the owner hid is not drawn, so it records no impressions either.
  const forYouOn = sectionOrder(view?.body.layout).includes('forYou');
  const outbox = useRecOutbox(listener !== undefined, forYouOn ? forYou.view?.body.items : undefined);
  const refreshBoth = async (): Promise<void> => {
    await Promise.all([refresh(), forYou.refresh()]);
  };
  // M19 T021: "Not interested" — a row the listener turned down leaves For You at once.
  const dismissals = useDismissals();
  const [moreFor, setMoreFor] = useState<EpisodeCard | undefined>();
  const [undo, setUndo] = useState<{ kind: DismissalKind; key: string; /** Where the card sat in the For You deck, so its Hidden card keeps the slot. */ at: number } | undefined>();
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(undoTimer.current), []);
  const model = useMemo(
    () => {
      const m = buildModel(view?.body, forYou.view?.body, { feeds: hiddenFeeds, blocked: sets.blocked });
      return { ...m, forYou: m.forYou.filter((r) => !dismissals.isDismissed(r.card)) };
    },
    // `version` bumps on every local report/block, so a hidden row leaves at once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, forYou.view, hiddenFeeds, sets, version, dismissals.isDismissed],
  );
  const notInterested = (kind: DismissalKind, card: EpisodeCard): void => {
    setMoreFor(undefined);
    const key = keyFor(kind, card);
    dismissals.dismiss(kind, key, kind === 'episode' ? card.title : card.showTitle).catch(() => {
      setUndo(undefined);
      toast("Couldn't hide that — try again.");
    });
    // The Hidden card takes the slot of the first card the choice removed (a show takes all of its cards).
    setUndo({ kind, key, at: hiddenAt(model.forYou, kind, card) });
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(undefined), UNDO_MS);
  };
  const undoHide = (): void => {
    if (!undo) return;
    clearTimeout(undoTimer.current);
    setUndo(undefined);
    dismissals.restore(undo.kind, undo.key).catch(() => toast("Couldn't undo — try again in Settings."));
  };
  // The search box's middle cycles through what is trending (owner, 2026-09-27).
  const hints = useMemo(() => trendingHints(model.chart), [model]);
  const showPage = (feedUrl: string): void =>
    router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(feedUrl) } });
  // Owner, 2026-10-01: "Categories" opens the genre strip with the first genre's list under it,
  // not the page of genre choices.
  const allCategories = (): void =>
    router.push({ pathname: '/category/[id]', params: { id: String(GENRES[0]!.id) } });
  const openSearch = (fromY: number, hint: string | undefined): void =>
    search.open({ fromY: Math.round(fromY), ...(hint ? { hint } : {}) });
  const hideCat = (id: number): void => setHiddenCats(hideCategory(stores.settings, id));
  const showCat = (id: number): void => setHiddenCats(showCategory(stores.settings, id));
  const shown = useFirstPaint(settled && forYou.settled);
  // Owner, 2026-10-05: "12 listened · 3 comments" under every episode on the page — one call.
  const stats = useRowStats(model);
  const act = {
    onOpen: (c: Parameters<typeof open>[0]) => void open(c),
    onPlay: (c: Parameters<typeof play>[0]) => void play(c),
    stats,
  };
  const scroller = useRef<React.ComponentRef<typeof RNScrollView>>(null);
  return {
    router, stores, view, refreshing, refreshBoth, queue, listener, forYou, outbox, model, hints, shown, act, scroller,
    moreFor, setMoreFor, undo, undoHide, notInterested, hiddenCats, hideCat, showCat, showPage, allCategories, openSearch, open,
  };
}

export type DiscoverPageData = ReturnType<typeof useDiscoverPage>;
