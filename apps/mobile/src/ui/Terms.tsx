/**
 * The Terms screen (owner, 2026-09-27). Drawn over the stack like the launch screen,
 * so no route — not even a link that opened the app — gets past it. One way out:
 * Accept. The Android back button is swallowed while it is up.
 *
 * It sits above the root layout's SafeAreaView, so it needs its own — without one the
 * title ran under the notch and the button under the home bar (owner, 2026-09-27).
 */
import { useEffect } from 'react';
import { BackHandler, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { Button } from './Button';
import { TERMS_SECTIONS, TERMS_TITLE } from './terms';

export function Terms(props: { onAccept: () => void }): React.ReactElement {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView className="absolute inset-0 bg-background">
    <View className="flex-1 px-screen-x pt-section pb-section">
      <Text className="text-text text-lg font-bold mb-section" accessibilityRole="header">{TERMS_TITLE}</Text>
      <ScrollView className="flex-1" contentContainerClassName="pb-section">
        {TERMS_SECTIONS.map((s) => (
          <View key={s.heading} className="mb-section">
            <Text className="text-text font-bold mb-row">{s.heading}</Text>
            <Text className="text-muted">{s.body}</Text>
          </View>
        ))}
      </ScrollView>
      <Text className="text-muted text-xs mb-row">You must accept to use SocialMorning.</Text>
      <Button label="Accept and continue" onPress={props.onAccept} />
    </View>
    </SafeAreaView>
  );
}
