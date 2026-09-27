/**
 * The consent screen (owner, 2026-09-27): the whole page, not a half sheet. Drawn over the stack like the launch screen,
 * so no route — not even a link that opened the app — gets past it. One way out: Agree.
 * "Disagree" only explains; it does not close the app (iOS does not allow that).
 *
 * A link opens the full document inside this same overlay (`LegalDoc`), not as a route:
 * a route would sit *under* the sheet. Android's back button closes an open document
 * and is otherwise swallowed.
 *
 * It sits above the root layout's SafeAreaView, so it needs its own — without one the
 * buttons ran under the home bar (owner, 2026-09-27).
 */
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Image, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { LEGAL_TEXT } from '../legal/texts';
import { Button } from './Button';
import { LegalDoc } from './LegalDoc';
import { CONSENT_INTRO, CONSENT_ITEMS, CONSENT_OUTRO, CONSENT_TITLE, DISAGREE_NOTE, type LegalDocId } from './terms';

const ICON = { width: 44, height: 44 };

export function Terms(props: { onAccept: () => void }): React.ReactElement {
  const [open, setOpen] = useState<LegalDocId | undefined>(undefined);
  const [refused, setRefused] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (openRef.current !== undefined) setOpen(undefined);
      return true;
    });
    return () => sub.remove();
  }, []);

  if (open !== undefined) return <LegalDoc text={LEGAL_TEXT[open]} onClose={() => setOpen(undefined)} />;

  return (
    <SafeAreaView className="absolute inset-0 bg-background">
      <View className="flex-1 px-screen-x pt-section pb-section">
        <Image source={require('../../assets/app-icon.png')} style={ICON} className="rounded-row mb-row" accessibilityIgnoresInvertColors />
        <Text className="text-text text-lg font-bold mb-section" accessibilityRole="header">{CONSENT_TITLE}</Text>
        <ScrollView className="flex-1" contentContainerClassName="pb-row">
          <Text className="text-muted text-sm mb-section">{CONSENT_INTRO}</Text>
          {CONSENT_ITEMS.map((item, n) => (
            <View key={item.doc} className="mb-section">
              <Pressable onPress={() => setOpen(item.doc)} accessibilityRole="link" accessibilityLabel={`${item.link}, opens the full text`}>
                <Text className="text-muted text-sm mb-row">
                  {`${n + 1}. `}
                  <Text className="text-accent underline">{item.link}</Text>
                  {' mainly covers:'}
                </Text>
              </Pressable>
              {item.points.map((p) => <Text key={p} className="text-muted text-sm pl-section mb-row">{`• ${p}`}</Text>)}
            </View>
          ))}
          <Text className="text-muted text-sm">{CONSENT_OUTRO}</Text>
          {refused ? <Text className="text-accent text-sm mt-section" accessibilityLiveRegion="polite">{DISAGREE_NOTE}</Text> : null}
        </ScrollView>
        <View className="flex-row gap-row mt-section">
          <Button label="Disagree" kind="secondary" onPress={() => setRefused(true)} className="flex-1" />
          <Button label="Agree" onPress={props.onAccept} className="flex-[2]" />
        </View>
      </View>
    </SafeAreaView>
  );
}
