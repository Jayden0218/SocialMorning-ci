// First-run page: you must agree to terms and privacy before using the app.
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
 * It sits above the root layout's SafeAreaView, so it pads the home strip itself (`OverlayPage` `inset`) — without it the
 * buttons ran under the home bar (owner, 2026-09-27).
 *
 * M31 S-C (T061; design-pulse2 `settings.html` `termsPage`, entries `terms--first-launch`, `terms--refused`, layout Panel): the
 * hot-to-violet glow behind the top; the app icon (56, radius 16), the intro (Geist 14 on 20, text-2), then one rounded tile
 * (radius 22) per document — its icon in hot-text, name 15/600, "n points" in mono 12 and a chevron; the first is open on arrival,
 * its points numbered 01–04 in hot-text mono, and "Read the full agreement ›" opens the whole document. The title "Service
 * Agreement and Privacy Policy" (Unbounded 800 22) sits low with Disagree (quiet, 120 wide) and Agree (light, 52) in the row under
 * it; the outro ends the scroll behind the fade. After Disagree the page stays behind a scrim and the second page is a centred
 * card: the icon, the title, the words, "Agree and continue" (light 52) and "Exit app" (ring), stacked. The page behind is hidden
 * from screen readers and touch while the card is up.
 *
 * Not as drawn: the fourth point is not dimmed to 60 % (that would put its text under 4.5:1; the drawing dims it as a hint that
 * the list goes on, and here the whole list is shown).
 */
import { useContext, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Image } from '@/ui/lib/image';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { LEGAL_TEXT } from '@/legal/texts';
import { bars, gutter, radius, spacing } from '@/design';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { OverlayPage } from '@/ui/kit/OverlayPage';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { AUTH, AUTH_TYPE } from '@/ui/auth/measures';
import { LegalDoc } from './LegalDoc';
import type { SettingsStore } from '@/storage/types';
import {
  CONSENT_INTRO,
  CONSENT_ITEMS,
  CONSENT_OUTRO,
  CONSENT_TITLE,
  REFUSE_TEXT,
  type LegalDocId,
} from './consent';

/** Each document's icon on its tile. */
const DOC_ICON: Record<LegalDocId, IconName> = {
  agreement: 'document-text-outline',
  privacy: 'lock-closed-outline',
  community: 'people-outline',
};

/** "Read the full agreement" — the link's last word, by document. */
const FULL: Record<LegalDocId, string> = {
  agreement: 'agreement',
  privacy: 'policy',
  community: 'guidelines',
};

/** The short name each document wears on its bar. */
const NAME: Record<LegalDocId, string> = {
  agreement: 'Service Agreement',
  privacy: 'Privacy Policy',
  community: 'Community Guidelines',
};

/**
 * One document as a tile (owner's reference, 2026-10-03): its icon, name and point count; a
 * tap on the head opens or closes its points; "Read the full …" opens the whole document.
 */
function Card(props: {
  item: (typeof CONSENT_ITEMS)[number];
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
}): React.ReactElement {
  const { item } = props;
  const c = useColours();
  return (
    <Box testID="terms-card" className="bg-raise" style={{ borderRadius: AUTH.terms.card }}>
      <Pressable
        onPress={props.onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${item.link}, ${item.points.length} points`}
        accessibilityState={{ expanded: props.expanded }}
        className="flex-row items-center"
        style={{ gap: spacing.row, paddingVertical: AUTH.terms.headPadY, paddingHorizontal: AUTH.terms.headPadX }}
      >
        <Icon name={DOC_ICON[item.doc]} size={22} color={c.hotText} />
        <Box className="flex-1">
          <Type step="row" className="text-text">{item.link}</Type>
          <Type step="mono" className="text-text2">{`${item.points.length} points`}</Type>
        </Box>
        <Icon name={props.expanded ? 'chevron-up' : 'chevron-down'} size={18} color={c.text3} />
      </Pressable>
      {props.expanded ? (
        <Box style={{ paddingHorizontal: AUTH.terms.headPadX, paddingBottom: AUTH.terms.headPadY, gap: AUTH.terms.pointGap }}>
          {/* Owner, 2026-10-03: numbered 01, 02 … instead of bullet dots. */}
          {item.points.map((p, i) => (
            <Box key={p} className="flex-row" style={{ gap: AUTH.terms.pointGap }}>
              <Type step="mono" className="text-hotText" style={{ paddingTop: 2 }}>{String(i + 1).padStart(2, '0')}</Type>
              <Type step="caption" className="text-text2 font-normal flex-1" style={AUTH_TYPE.consent}>{p}</Type>
            </Box>
          ))}
          <Pressable onPress={props.onOpen} accessibilityRole="link" accessibilityLabel={`${item.link}, opens the full text`} className="justify-center self-start" style={{ minHeight: bars.field }}>
            <Type step="row" className="text-hotText">{`Read the full ${FULL[item.doc]} ›`}</Type>
          </Pressable>
        </Box>
      ) : null}
    </Box>
  );
}

/** Android can close itself; iOS cannot (and must not), so there Exit returns to page one. */
const exitApp = (back: () => void): void => {
  if (Platform.OS === 'android') BackHandler.exitApp();
  else back();
};

export function Terms(props: {
  onAccept: () => void;
  exit?: (back: () => void) => void;
  /** Kept so the caller does not change: the colours come from the palette, not from the store, since M31. */
  settings?: Pick<SettingsStore, 'get'>;
}): React.ReactElement {
  const insets = useContext(SafeAreaInsetsContext);
  const { width } = useWindowDimensions();
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

  if (open !== undefined) return <LegalDoc text={LEGAL_TEXT[open]} name={NAME[open]} onClose={() => setOpen(undefined)} />;

  const page = (
    <Box className="absolute inset-0 bg-void">
      <OverlayPage
        title={CONSENT_TITLE}
        size={AUTH_TYPE.cardTitle.fontSize}
        onBack={null}
        glowTop={-280}
        glowStrength={0.3}
        inset={insets?.bottom ?? 0}
        foot={(
          <>
            <Box style={{ width: AUTH.terms.disagree }}>
              <PulseButton label="Disagree" kind="quiet" full onPress={() => setRefused(true)} />
            </Box>
            <PulseButton label="Agree" kind="light" height={AUTH.foot.button} className="flex-1" onPress={props.onAccept} />
          </>
        )}
      >
        {(l) => (
          // Full width, so the scroll bar sits on the screen's edge; the side margin is on the content instead.
          <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: l.top + AUTH.bodyTop, paddingBottom: l.reserve, paddingHorizontal: gutter(width), gap: AUTH.terms.gap }}>
            <Image source={require('../../../assets/app-icon.png')} style={{ width: AUTH.terms.icon, height: AUTH.terms.icon, borderRadius: AUTH.terms.iconRadius }} accessibilityIgnoresInvertColors />
            <Type step="body" className="text-text2 font-normal" style={AUTH_TYPE.age}>{CONSENT_INTRO}</Type>
            {CONSENT_ITEMS.map((item) => (
              <Card key={item.doc} item={item} expanded={expanded === item.doc} onToggle={() => setExpanded(expanded === item.doc ? undefined : item.doc)} onOpen={() => setOpen(item.doc)} />
            ))}
            <Type step="caption" className="text-text2">{CONSENT_OUTRO}</Type>
          </ScrollView>
        )}
      </OverlayPage>
    </Box>
  );

  if (!refused) return page;

  // `terms--refused`: the page stays drawn behind a scrim, out of reach of touch and screen readers; the second page is a
  // centred card over it.
  return (
    <Box className="absolute inset-0">
      <Box className="absolute inset-0" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {page}
      </Box>
      <Box className="absolute inset-0 bg-scrim justify-center">
        <Box
          testID="terms-refusal"
          className="bg-raise2 border border-line"
          accessibilityViewIsModal
          style={{ marginHorizontal: bars.dialogSide, padding: bars.dialogPad, borderRadius: radius.dialog, gap: AUTH.refusal.gap }}
        >
          <Image source={require('../../../assets/app-icon.png')} style={{ width: AUTH.refusal.icon, height: AUTH.refusal.icon, borderRadius: AUTH.refusal.iconRadius }} accessibilityIgnoresInvertColors />
          <Type step="hero" className="text-text" style={AUTH_TYPE.cardTitle} accessibilityRole="header">{CONSENT_TITLE}</Type>
          <Type step="body" className="text-text2 font-normal" style={AUTH_TYPE.age}>{REFUSE_TEXT}</Type>
          <PulseButton label="Agree and continue" kind="light" height={AUTH.foot.button} full onPress={props.onAccept} />
          <PulseButton label="Exit app" kind="ring" full onPress={() => (props.exit ?? exitApp)(() => setRefused(false))} />
        </Box>
      </Box>
    </Box>
  );
}
