/**
 * The consent screen (owner, 2026-09-27): the whole page, not a half sheet. Drawn over the stack like the launch screen,
 * so no route — not even a link that opened the app — gets past it. One way out: Agree.
 * "Disagree" opens a second page (the owner's screenshot, 2026-09-27): "Exit app" or
 * "Agree and continue". Exit closes the app on Android; iOS does not allow an app to
 * close itself, so there it goes back to the first page.
 *
 * A link opens the full document inside this same overlay (`LegalDoc`), not as a route:
 * a route would sit *under* the sheet. Android's back button closes an open document
 * and is otherwise swallowed.
 *
 * It sits above the root layout's SafeAreaView, so it needs its own — without one the
 * buttons ran under the home bar (owner, 2026-09-27).
 */
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import { Image } from './lib/image';
import { Pressable } from './lib/pressable';
import { SafeAreaView } from './lib/safe-area-view';
import { ScrollView } from './lib/scroll-view';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { LEGAL_TEXT } from '../legal/texts';
import { Button, ButtonText } from './lib/button';
import { Heading } from './lib/heading';
import { hit } from '../design';
import { EDGE, LegalDoc } from './LegalDoc';
import { CONSENT_INTRO, CONSENT_ITEMS, CONSENT_OUTRO, CONSENT_TITLE, REFUSE_TEXT, type LegalDocId } from './terms';

const ICON = { width: 44, height: 44 };

/** Apple's and Android's minimum tap size, as a style (shared-ui asserts it). */
const TAP = { minHeight: hit.min };

/**
 * M9: the two choices are gluestack Buttons — solid yellow for yes, outlined for no. The
 * words are the name, and the state is a state, not only an opacity.
 */
function Choice(props: { label: string; onPress: () => void; outline?: boolean; className: string }): React.ReactElement {
  return (
    <Button variant={props.outline ? 'outline' : 'default'} onPress={props.onPress} accessibilityRole="button" accessibilityLabel={props.label} className={`rounded-pill px-section ${props.outline ? 'bg-transparent' : ''} ${props.className}`} style={TAP}>
      <ButtonText className={props.outline ? 'text-sm font-semibold text-text' : 'text-sm font-semibold text-onPrimary'}>{props.label}</ButtonText>
    </Button>
  );
}

/** Android can close itself; iOS cannot (and must not), so there Exit returns to page one. */
const exitApp = (back: () => void): void => { if (Platform.OS === 'android') BackHandler.exitApp(); else back(); };

export function Terms(props: { onAccept: () => void; exit?: (back: () => void) => void }): React.ReactElement {
  const [open, setOpen] = useState<LegalDocId | undefined>(undefined);
  const [refused, setRefused] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  const refusedRef = useRef(refused);
  refusedRef.current = refused;

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (openRef.current !== undefined) setOpen(undefined);
      else if (refusedRef.current) setRefused(false);
      return true;
    });
    return () => sub.remove();
  }, []);

  if (open !== undefined) return <LegalDoc text={LEGAL_TEXT[open]} onClose={() => setOpen(undefined)} />;

  if (refused) {
    return (
      <Box className="absolute inset-0 bg-scrim justify-end">
        <SafeAreaView className="bg-background rounded-t-artwork">
          <Box className="px-screen-x pt-section pb-section">
            <Image source={require('../../assets/app-icon.png')} style={ICON} className="rounded-row mb-row" accessibilityIgnoresInvertColors />
            <Heading className="text-text text-lg font-bold mb-row" accessibilityRole="header">{CONSENT_TITLE}</Heading>
            <Text className="text-text text-sm">{REFUSE_TEXT}</Text>
            <Box className="flex-row gap-row mt-section">
              <Choice label="Exit app" outline onPress={() => (props.exit ?? exitApp)(() => setRefused(false))} className="flex-1" />
              <Choice label="Agree and continue" onPress={props.onAccept} className="flex-[2]" />
            </Box>
          </Box>
        </SafeAreaView>
      </Box>
    );
  }

  return (
    <SafeAreaView className="absolute inset-0 bg-background">
      <Box className="flex-1 pt-section pb-section">
        <Box className="px-screen-x">
          <Image source={require('../../assets/app-icon.png')} style={ICON} className="rounded-row mb-row" accessibilityIgnoresInvertColors />
          <Heading className="text-text text-lg font-bold mb-section" accessibilityRole="header">{CONSENT_TITLE}</Heading>
        </Box>
        {/* Full width, so the scroll bar sits on the screen's edge with no gap (owner, 2026-09-29);
            the side margin is on the content instead. Same as LegalDoc. */}
        <ScrollView className="flex-1" contentContainerClassName="px-screen-x pb-row" automaticallyAdjustsScrollIndicatorInsets={false} scrollIndicatorInsets={EDGE}>
          <Text className="text-muted text-sm mb-section">{CONSENT_INTRO}</Text>
          {CONSENT_ITEMS.map((item, n) => (
            <Box key={item.doc} className="mb-section">
              <Pressable onPress={() => setOpen(item.doc)} accessibilityRole="link" accessibilityLabel={`${item.link}, opens the full text`}>
                <Text className="text-muted text-sm mb-row">
                  {`${n + 1}. `}
                  <Text className="text-accent underline">{item.link}</Text>
                  {' mainly covers:'}
                </Text>
              </Pressable>
              {item.points.map((p) => (
                <Box key={p} className="flex-row pl-section mb-row">
                  <Text className="text-muted text-sm min-w-5 pr-2">•</Text>
                  <Text className="text-muted text-sm flex-1">{p}</Text>
                </Box>
              ))}
            </Box>
          ))}
          <Text className="text-muted text-sm">{CONSENT_OUTRO}</Text>
        </ScrollView>
        <Box className="flex-row gap-row mt-section px-screen-x">
          <Choice label="Disagree" outline onPress={() => setRefused(true)} className="flex-1" />
          <Choice label="Agree" onPress={props.onAccept} className="flex-[2]" />
        </Box>
      </Box>
    </SafeAreaView>
  );
}
