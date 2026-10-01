/**
 * Owner, 2026-10-01 (the 小宇宙 player): the player page is dark in either app theme.
 *  - `ScopedTheme` (uniwind 1.12.0) flips every class inside to the dark token set, so
 *    `text-text`, `bg-surface`, `bg-veil` … all read from `colourDark`;
 *  - `ForcedPalette` hands the same dark values to JS colour readers that opt in;
 *  - the status bar turns light while the player is mounted (the root one is popped back
 *    when it closes — React Native keeps a stack of StatusBar entries).
 */
import { StatusBar } from 'expo-status-bar';
import { ScopedTheme } from 'uniwind';
import { ForcedPalette, usePlayerPalette } from './palette';

export function PlayerDark(props: { children: React.ReactNode }): React.ReactElement {
  const palette = usePlayerPalette();
  return (
    <ScopedTheme theme="dark">
      <ForcedPalette.Provider value={palette}>
        <StatusBar style="light" />
        {props.children}
      </ForcedPalette.Provider>
    </ScopedTheme>
  );
}
