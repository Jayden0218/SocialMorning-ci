// Discover's search field with the trending hint that changes every few seconds.
/**
 * Moved out of app/(tabs)/index.tsx (M31 T025, review D7). The scroll audit (2026-10-04, branch perf):
 * the hint's timer lived in the page, so every 4 s the WHOLE Discover page re-rendered (every section,
 * every cover) — and it kept ticking under every other page. Now only the controls that show the hint
 * re-render, and only while Home is the screen in front (`useFocusEffect`). M31: the collapsed bar's
 * search button is gone (the field is pinned low and stays — design-pulse2 `home--screen`); the
 * Moments view's search circle takes the same hint through `useTrendingHint`.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { HINT_EVERY_MS, hintAt } from '@/discover/trending';
import { SearchBar } from './parts';
import { HomeSwitch } from './HomeSwitch';
import type { HomeView } from './homeView';

/** The trending hint at this moment, cycling every HINT_EVERY_MS while Home is on screen. */
export function useTrendingHint(hints: readonly string[]): string | undefined {
  const [tick, setTick] = useState(0);
  useFocusEffect(useCallback(() => {
    if (hints.length < 2) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), HINT_EVERY_MS);
    return () => clearInterval(t);
  }, [hints]));
  return hintAt(hints, tick);
}

/** The search field with its trending hint. */
export function TrendingSearchBar(props: { hints: readonly string[]; onOpen: (fromY: number, hint: string | undefined) => void; onScan: () => void }): React.ReactElement {
  const hint = useTrendingHint(props.hints);
  return <SearchBar {...(hint ? { hint } : {})} onPress={(fromY) => props.onOpen(fromY, hint)} onScan={props.onScan} />;
}

/** The Home switch; on the Moments view its search circle is named with the same trending hint. */
export function TrendingHomeSwitch(props: { hints: readonly string[]; view: HomeView; onChange: (view: HomeView) => void; onSearch: (fromY: number, hint: string | undefined) => void }): React.ReactElement {
  // Only the Moments view has the circle; on Discover the field above shows the hint, so no timer here.
  const hint = useTrendingHint(props.view === 'moments' ? props.hints : []);
  return (
    <HomeSwitch
      view={props.view}
      onChange={props.onChange}
      {...(props.view === 'moments' ? { search: { label: hint ? `Search. Trending: ${hint}` : 'Search shows and episodes', onOpen: (fromY: number) => props.onSearch(fromY, hint) } } : {})}
    />
  );
}
