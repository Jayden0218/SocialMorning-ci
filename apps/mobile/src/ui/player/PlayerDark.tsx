/**
 * Owner, 2026-10-01 (the 小宇宙 player): the player page is dark in either app theme.
 *  - `ScopedTheme` (uniwind 1.12.0) flips every class inside to the dark token set, so
 *    `text-text`, `bg-surface`, `bg-veil` … all read from `colourDark`;
 *  - `ForcedPalette` hands the same dark values to JS colour readers that opt in;
 *  - the status bar turns light while the player is the page on screen. Phone check 2026-10-02:
 *    while mounted it also stayed light under Comments (pushed over the player), so the clock was
 *    white on white; the entry now leaves the StatusBar stack when the player loses focus.
 */
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ScopedTheme } from 'uniwind';
import { ForcedPalette, usePlayerPalette } from './palette';

export function PlayerDark(props: { children: React.ReactNode }): React.ReactElement {
  const palette = usePlayerPalette();
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  return (
    <ScopedTheme theme="dark">
      <ForcedPalette.Provider value={palette}>
        {focused ? <StatusBar style="light" /> : null}
        {props.children}
      </ForcedPalette.Provider>
    </ScopedTheme>
  );
}
