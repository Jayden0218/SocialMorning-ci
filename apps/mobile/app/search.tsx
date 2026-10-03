/**
 * The `/search` route (M1; M10 layout; owner 2026-10-01 behaviour) — the page itself is
 * src/ui/search/SearchPage.tsx.
 *
 * M17 (phone walk 2026-10-02): from Discover, Search is drawn in place over the tabs
 * (src/ui/search/SearchOverlay.tsx), so pages opened from its results are ordinary pushes with
 * the edge swipe. This route stays for every other way in — the show page's Search, a scanned
 * code's text (`?q=`), links — as an ordinary page on the stack (no longer a `transparentModal`,
 * which turned every page pushed after it into a modal sheet). Guard: __tests__/search-in-place.test.ts.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SearchPage } from '@/ui/search/SearchPage';

export default function SearchScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; hint?: string; fromY?: string }>();
  const fromY = params.fromY !== undefined && Number.isFinite(Number(params.fromY)) ? Number(params.fromY) : undefined;
  return (
    <SearchPage
      {...(params.q !== undefined ? { q: params.q } : {})}
      {...(params.hint !== undefined ? { hint: params.hint } : {})}
      {...(fromY !== undefined ? { fromY } : {})}
      onClose={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }}
    />
  );
}
