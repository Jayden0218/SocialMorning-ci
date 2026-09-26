/**
 * The launch screen (owner, 2026-09-27). Drawn **over** the stack, not instead of it:
 * the router stays mounted, so a link that opened the app (M4) still lands on its
 * screen underneath and is there when this lifts.
 */
import { ActivityIndicator, Text, View } from 'react-native';
import { colour } from '../design';

export function Splash(): React.ReactElement {
  return (
    <View
      className="absolute inset-0 bg-background items-center justify-center"
      accessibilityRole="progressbar"
      accessibilityLabel="Syncing your latest listening"
      accessibilityLiveRegion="polite"
    >
      <Text className="text-text text-lg font-bold mb-6">SocialMorning</Text>
      <ActivityIndicator color={colour.accent} />
      <Text className="text-muted mt-4">Syncing your latest…</Text>
    </View>
  );
}
