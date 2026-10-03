// Picks which outside surfaces this phone supports, without crashing.
/**
 * Picks this platform's outside surfaces. The native modules are required lazily and inside
 * try: a build without them (Expo Go, the test runner, an iPhone below 16.2) gets fewer
 * surfaces, never a crash.
 */
import { Platform } from 'react-native';
import type { OutsideSink } from './bridge';

export function platformSinks(): OutsideSink[] {
  const out: OutsideSink[] = [];
  try {
    if (Platform.OS === 'android') {
      out.push((require('./android-widget') as typeof import('./android-widget')).androidWidgetSink);
    } else if (Platform.OS === 'ios') {
      const ios = require('./ios') as typeof import('./ios');
      try { out.push(ios.iosWidgetSink(require('@bacons/apple-targets'))); } catch { /* no widget target in this build */ }
      try { out.push(ios.liveActivitySink(require('expo-live-activity'))); } catch { /* no live activity in this build */ }
    }
  } catch { /* no native widget module in this build */ }
  return out;
}
