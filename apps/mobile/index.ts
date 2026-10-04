/**
 * The app's entry. M10b US9: the Android widget's task handler must be registered before the
 * app starts, because Android may run it with no screen open (a widget added or resized).
 * Everything else is expo-router's own entry.
 */
import { Platform } from 'react-native';
// Before any component: the class merger must know the app's text sizes (src/design/merge.ts).
import '@/design/merge';

if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget') as typeof import('react-native-android-widget');
    const { widgetTaskHandler } = require('@/outside/android-widget') as typeof import('@/outside/android-widget');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch { /* a build without the widget module still starts */ }
}

import 'expo-router/entry';
