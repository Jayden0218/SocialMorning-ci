// Picks which outside surfaces this phone supports, without crashing.
/**
 * Picks this platform's outside surfaces. The native modules are required lazily and inside
 * try: a build without them (Expo Go, the test runner, an iPhone below 16.2) gets fewer
 * surfaces, never a crash.
 */
import { Platform } from 'react-native';
import type { OutsideSink } from './bridge';
import type { SettingsStore } from '@/storage/types';
import type { WidgetDataSink } from './widget-data';

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

/**
 * M21 US11: where the Playlist, Daily pick and Listening-this-week copies go on this phone. On
 * Android the widget handler is also given the app's settings store, so while the app runs it
 * reads the copies through it instead of opening the database a second time.
 */
export function platformWidgetDataSinks(settings?: Pick<SettingsStore, 'get'>): WidgetDataSink[] {
  const out: WidgetDataSink[] = [];
  try {
    if (Platform.OS === 'android') {
      const android = require('./android-widget') as typeof import('./android-widget');
      android.setWidgetSettings(settings);
      out.push(android.androidWidgetDataSink);
    } else if (Platform.OS === 'ios') {
      const ios = require('./ios') as typeof import('./ios');
      try { out.push(ios.iosWidgetDataSink(require('@bacons/apple-targets'))); } catch { /* no widget target in this build */ }
    }
  } catch { /* no native widget module in this build */ }
  return out;
}
