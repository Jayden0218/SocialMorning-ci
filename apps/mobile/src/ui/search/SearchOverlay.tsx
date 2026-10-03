/**
 * Search, drawn in place over the tabs (M17; 小宇宙's Search "fades in in place" and is closed
 * with 返回 — xiaoyuzhou-map.md row 14).
 *
 * Why not a route: phone walk 2026-10-02 (M16a Tier B), an episode opened from Search could not
 * be closed with the left-edge swipe (0 of 5). Search was a `transparentModal` route so Discover
 * stayed visible under it, and expo-router's native stack groups every route pushed after a modal
 * with it (`getModalRouteKeys`: a route with no `presentation` after a modal is presented as a
 * modal too) — the episode became an iOS modal sheet, which has no edge swipe. A `card` push on
 * top of the modal would not help either: react-native-screens puts push controllers in the
 * navigation controller UNDER the presented modal (RNSScreenStack.mm `updateContainer`).
 *
 * Drawn here instead, the overlay sits inside the `(tabs)` screen of the root stack: Discover
 * stays under it (its see-through backdrop fades in while the box moves up), and a result page
 * is an ordinary push above the whole tab screen — the edge swipe brings the listener back to
 * Search, still open with its results. The tab bar and its mini player are under the overlay.
 * Guard: __tests__/search-in-place.test.ts.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Box } from '../lib/box';
import { SearchPage } from './SearchPage';

type Opening = { fromY: number; hint?: string; key: number };
type SearchOverlayApi = { open: (at: { fromY: number; hint?: string }) => void; isOpen: boolean };

const Context = createContext<SearchOverlayApi | undefined>(undefined);

export function useSearchOverlay(): SearchOverlayApi {
  const api = useContext(Context);
  if (api === undefined) throw new Error('useSearchOverlay must be used inside <SearchOverlayHost>');
  return api;
}

export function SearchOverlayHost(props: { children: ReactNode }): React.ReactElement {
  const [opening, setOpening] = useState<Opening | undefined>(undefined);
  const open = useCallback((at: { fromY: number; hint?: string }) => {
    setOpening((o) => o ?? { ...at, key: Date.now() });
  }, []);
  const close = useCallback(() => setOpening(undefined), []);
  const api = useMemo(() => ({ open, isOpen: opening !== undefined }), [open, opening]);
  return (
    <Context.Provider value={api}>
      <Box className="flex-1">
        {/* While Search is open, a screen reader reads only Search (the tabs stay drawn under it). */}
        <Box
          className="flex-1"
          accessibilityElementsHidden={opening !== undefined}
          importantForAccessibility={opening !== undefined ? 'no-hide-descendants' : 'auto'}
        >
          {props.children}
        </Box>
        {opening ? (
          <Box className="absolute inset-0" accessibilityViewIsModal>
            <SearchPage key={opening.key} fromY={opening.fromY} {...(opening.hint !== undefined ? { hint: opening.hint } : {})} onClose={close} />
          </Box>
        ) : null}
      </Box>
    </Context.Provider>
  );
}
