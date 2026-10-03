/**
 * Keeps Android Auto's lists current (src/outside/car.ts): at start, when the app comes back
 * to the front, when hidden shows change, and when the playing episode changes. Draws nothing.
 */
import { requireOptionalNativeModule } from 'expo';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { usePlayer } from '@/playback/store';
import { useSafety } from '@/safety/context';
import { toPlayable } from '@/storage/playable';
import { useStores } from '@/ui/shell/providers';
import { carSections, createCarSync, type CarNative } from './car';

export function CarLibrarySync(): null {
  const stores = useStores();
  const runtime = usePlayer();
  const { hiddenFeeds } = useSafety();
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const native = requireOptionalNativeModule<CarNative>('ExpoAudio');
    if (!native || typeof native.setCarLibrary !== 'function') return; // an unpatched build
    const sync = createCarSync({ native, build: () => carSections(stores, hiddenFeeds), runtime, playable: (id) => toPlayable(stores, id) });
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') sync.push(); });
    return () => { sub.remove(); sync.dispose(); };
  }, [stores, runtime, hiddenFeeds]);
  return null;
}
