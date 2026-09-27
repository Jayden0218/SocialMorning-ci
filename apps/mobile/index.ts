/**
 * The app's entry. M10b US9: the Android widget's task handler must be registered before the
 * app starts, because Android may run it with no screen open (a widget added or resized).
 * Everything else is expo-router's own entry.
 */
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget') as typeof import('react-native-android-widget');
    const { widgetTaskHandler } = require('./src/outside/android-widget') as typeof import('./src/outside/android-widget');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch { /* a build without the widget module still starts */ }
}

import 'expo-router/entry';
