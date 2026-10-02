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
/** Drawn over the stack, outside the root layout's bottom inset — so this pads all four edges (M12). */
const ALL_EDGES = ['top', 'bottom', 'left', 'right'] as const;
const SHEET_EDGES = ['bottom', 'left', 'right'] as const;
import { ScrollView } from './lib/scroll-view';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { LEGAL_TEXT } from '../legal/texts';
import { Button, ButtonText } from './lib/button';
import { Heading } from './lib/heading';
import { EDGE, LegalDoc } from './LegalDoc';
import { Icon, type IconName } from './Icon';
import { useColours } from './useColours';
import { colour, hit, type Palette } from '../design';
import { display } from './auth/display';
import type { SettingsStore } from '../storage/types';
import { CONSENT_INTRO, CONSENT_ITEMS, CONSENT_OUTRO, CONSENT_TITLE, REFUSE_TEXT, type LegalDocId } from './terms';

const ICON = { width: 44, height: 44 };

/** Apple's and Android's minimum tap size, as a style (shared-ui asserts it). */
const TAP = { minHeight: hit.min };
/**
 * Words on the brand-yellow fill are dark (owner, 2026-10-03) — AuthShell's `inkOn`, not
 * imported: AuthShell reads the providers, and the providers draw this page.
 */
const inkOn = (c: Palette): string => (c.primary === colour.primary ? colour.text : c.onPrimary);

/** Agree and the other choices: 56 pt tall (owner, 2026-10-03), as the consent sheet's Agree. */
const TALL = { minHeight: 56 };

/**
 * M9: the two choices are gluestack Buttons — solid yellow for yes, outlined for no. The
 * words are the name, and the state is a state, not only an opacity.
 */
function Choice(props: { label: string; onPress: () => void; outline?: boolean; className: string; colours: Palette }): React.ReactElement {
  return (
    <Button variant={props.outline ? 'outline' : 'default'} onPress={props.onPress} accessibilityRole="button" accessibilityLabel={props.label} className={`rounded-pill px-section ${props.outline ? 'bg-transparent' : ''} ${props.className}`} style={TALL}>
      <ButtonText className={props.outline ? 'text-base font-semibold text-text' : 'text-base font-semibold text-onPrimary'} style={props.outline ? undefined : { color: inkOn(props.colours) }}>{props.label}</ButtonText>
    </Button>
  );
}

/** Each document's icon on its card. */
const DOC_ICON: Record<LegalDocId, IconName> = {
  agreement: 'document-text-outline',
  privacy: 'shield-checkmark-outline',
  community: 'people-outline',
};

/** "Read the full agreement" — the link's last word, by document. */
const FULL: Record<LegalDocId, string> = { agreement: 'agreement', privacy: 'policy', community: 'guidelines' };

/** Tests render the page without the stores; the theme then follows the system. */
const NO_SETTINGS: Pick<SettingsStore, 'get'> = { get: () => undefined };

/**
 * One document as a card (owner's reference, 2026-10-03): its icon, name and point count; a
 * tap on the head opens or closes its points; "Read the full …" opens the whole document.
 */
function Card(props: { item: (typeof CONSENT_ITEMS)[number]; colours: Palette; expanded: boolean; onToggle: () => void; onOpen: () => void }): React.ReactElement {
  const { item, colours: c } = props;
  return (
    <Box className="rounded-artwork border border-separator bg-background px-section">
      <Pressable
        onPress={props.onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${item.link}, ${item.points.length} points`}
        accessibilityState={{ expanded: props.expanded }}
        className="flex-row items-center gap-row py-row"
        style={TAP}
      >
        <Icon name={DOC_ICON[item.doc]} size={22} color={c.accent} />
        <Box className="flex-1">
          <Text className="text-text text-lg font-semibold">{item.link}</Text>
          <Text className="text-muted text-xs">{item.points.length} points</Text>
        </Box>
        <Icon name={props.expanded ? 'chevron-up' : 'chevron-down'} size={18} color={c.muted} />
      </Pressable>
      {props.expanded ? (
        <Box className="pb-section">
          {item.points.map((p) => (
            <Box key={p} className="flex-row mb-row">
              <Text className="text-text text-sm leading-[22px] min-w-5 pr-2">•</Text>
              <Text className="text-text text-sm leading-[22px] flex-1">{p}</Text>
            </Box>
          ))}
          <Pressable onPress={props.onOpen} accessibilityRole="link" accessibilityLabel={`${item.link}, opens the full text`} className="justify-center self-start" style={TAP}>
            <Text className="text-accent text-sm font-semibold underline">Read the full {FULL[item.doc]}</Text>
          </Pressable>
        </Box>
      ) : null}
    </Box>
  );
}

/** Android can close itself; iOS cannot (and must not), so there Exit returns to page one. */
const exitApp = (back: () => void): void => { if (Platform.OS === 'android') BackHandler.exitApp(); else back(); };

export function Terms(props: { onAccept: () => void; exit?: (back: () => void) => void; settings?: Pick<SettingsStore, 'get'> }): React.ReactElement {
  const c = useColours(props.settings ?? NO_SETTINGS);
  const [open, setOpen] = useState<LegalDocId | undefined>(undefined);
  // The first document is open when the page appears (owner's reference, 2026-10-03).
  const [expanded, setExpanded] = useState<LegalDocId | undefined>(CONSENT_ITEMS[0]?.doc);
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
        <SafeAreaView edges={SHEET_EDGES} className="bg-background rounded-t-artwork">
          <Box className="px-screen-x pt-section pb-section">
            <Image source={require('../../assets/app-icon.png')} style={ICON} className="rounded-row mb-row" accessibilityIgnoresInvertColors />
            <Heading className="text-text text-lg font-bold mb-row" accessibilityRole="header">{CONSENT_TITLE}</Heading>
            <Text className="text-text text-sm">{REFUSE_TEXT}</Text>
            <Box className="flex-row gap-row mt-section">
              <Choice colours={c} label="Exit app" outline onPress={() => (props.exit ?? exitApp)(() => setRefused(false))} className="flex-1" />
              <Choice colours={c} label="Agree and continue" onPress={props.onAccept} className="flex-[2]" />
            </Box>
          </Box>
        </SafeAreaView>
      </Box>
    );
  }

  return (
    <SafeAreaView edges={ALL_EDGES} className="absolute inset-0 bg-surface">
      {/* Full width, so the scroll bar sits on the screen's edge with no gap (owner, 2026-09-29);
          the side margin is on the content instead. Same as LegalDoc. */}
      <ScrollView className="flex-1" contentContainerClassName="px-screen-x pt-section pb-section" automaticallyAdjustsScrollIndicatorInsets={false} scrollIndicatorInsets={EDGE}>
        <Image source={require('../../assets/app-icon.png')} style={ICON} className="rounded-row mb-section" accessibilityIgnoresInvertColors />
        <Text style={display(30, c.text)} className="mb-row" accessibilityRole="header">{CONSENT_TITLE}</Text>
        <Text className="text-muted text-sm leading-[22px] mb-section">{CONSENT_INTRO}</Text>
        <Box className="gap-row">
          {CONSENT_ITEMS.map((item) => (
            <Card key={item.doc} item={item} colours={c} expanded={expanded === item.doc} onToggle={() => setExpanded(expanded === item.doc ? undefined : item.doc)} onOpen={() => setOpen(item.doc)} />
          ))}
        </Box>
        <Text className="text-muted text-xs mt-section">{CONSENT_OUTRO}</Text>
      </ScrollView>
      <Box className="border-t border-separator px-screen-x pt-section pb-row">
        <Choice colours={c} label="Agree" onPress={props.onAccept} className="w-full" />
        <Pressable onPress={() => setRefused(true)} accessibilityRole="button" accessibilityLabel="Disagree" className="items-center justify-center mt-gap" style={TAP}>
          <Text className="text-accent text-base font-bold">Disagree</Text>
        </Pressable>
      </Box>
    </SafeAreaView>
  );
}
