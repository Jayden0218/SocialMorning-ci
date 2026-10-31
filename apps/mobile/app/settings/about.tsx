// About the app: version, service agreement, privacy policy, community rules.
/**
 * About SocialNet (关于我们, M10): the version, and the three documents — service
 * agreement, privacy policy, community guidelines — opened in the app (M6 FR-027's
 * privacy policy and community rules live here now).
 *
 * M17 (`SettingsAbout-B`, T080): the Editorial layout — the back row only (no big page title;
 * the app's name beside its icon is the header), the app's line as a serif pull quote, then
 * "The documents" as three cards in a row, each with its icon tile, a serif name and "Read".
 * Each card opens its document exactly as the old rows did.
 *
 * M31 S-A (T060; design-pulse2 `settings-about--screen`, `--legal-sheet`; Mosaic + Panel): the app icon 64 (radius 18, a hot glow), "SocialNet" in Unbounded 26, "Version 0.1.0" in mono 12 with an amber
 * DEV chip on development builds; the quote in Unbounded 18 and "Audio always streams from its publisher." (13); **the documents** as three 1 x 1 tiles (112, radius 22): an icon in a 36 square,
 * the name 13 / 600, "Read ›" in mono hot-text — each opens the full document; then group rows Check for updates (Android GitHub copies only), Widgets, Open-source licences. The title
 * "About SocialNet" is in the bottom bar (before it had no title text). The full document is `LegalDoc` in a full-screen modal (the drawing's `legalPage`; its look belongs to the shell lane).
 */
import Constants from 'expo-constants';
import { Modal, ModalBackdrop, ModalContent } from '@/ui/lib/modal';
import { Image } from '@/ui/lib/image';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { useState } from 'react';
import { Link } from 'expo-router';
import { LEGAL_TEXT } from '@/legal/texts';
import { LegalDoc } from '@/ui/shell/LegalDoc';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { colour, glow } from '@/design';
import { Platform } from 'react-native';
import { PanelGroup } from '@/ui/me/Panel';
import { distributionOf, updaterShown } from '@/ui/shell/updater';
import { appVariant } from '@/config/variant';
import { Note, Sec, SetPage, SetRow } from '@/ui/settings/hub-parts';
import { SET, SET_TYPE } from '@/ui/settings/hub-measures';

type Doc = keyof typeof LEGAL_TEXT;
const ICON = 64;
const TILE = 36;

const DOCS: { doc: Doc; icon: IconName; label: string }[] = [
  { doc: 'agreement', icon: 'document-text-outline', label: 'Service agreement' },
  { doc: 'privacy', icon: 'lock-closed-outline', label: 'Privacy policy' },
  { doc: 'community', icon: 'people-outline', label: 'Community guidelines' },
];

export default function AboutScreen(): React.ReactElement {
  const [doc, setDoc] = useState<Doc | undefined>();
  return (
    <PushedPage title="About SocialNet" size={28}>
      {(layout) => (
        <SetPage layout={layout}>
          <Box className="flex-row items-center" style={{ gap: 14, paddingTop: SET.gap }}>
            <Image source={require('../../assets/app-icon.png')} style={{ width: ICON, height: ICON, borderRadius: 18, shadowColor: glow.hot.color, shadowOpacity: glow.hot.opacity, shadowRadius: glow.hot.radius, shadowOffset: { width: 0, height: 0 } }} accessibilityLabel="SocialNet" />
            <Box className="flex-1">
              <Type step="hero" className="text-text" style={SET_TYPE.display26} accessibilityRole="header">SocialNet</Type>
              <Box className="flex-row items-center" style={{ gap: 6, marginTop: 6 }}>
                <Type step="mono" className="text-text2" style={SET_TYPE.mono12}>{`Version ${Constants.expoConfig?.version ?? '?'}`}</Type>
                {/* Lane DP: the dev app (APP_VARIANT=dev) says so, beside its version. */}
                {appVariant() === 'dev' ? (
                  <Box className="bg-warn" style={{ borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }} accessible accessibilityLabel="Development build">
                    <Type step="badge" className="text-void" style={SET_TYPE.tag10}>DEV</Type>
                  </Box>
                ) : null}
              </Box>
            </Box>
          </Box>
          <Type step="lede" className="text-text">“Podcasts, with the people listening alongside you.”</Type>
          <Note>Audio always streams from its publisher.</Note>
          <Sec label="Documents">
            <Box className="flex-row" style={{ gap: 8 }}>
              {DOCS.map((d) => (
                <Pressable
                  key={d.doc}
                  onPress={() => setDoc(d.doc)}
                  accessibilityRole="button"
                  accessibilityLabel={d.label}
                  testID="doc-tile"
                  className="bg-raise justify-between"
                  style={{ flex: 1, minWidth: 0, minHeight: SET.bigMin, borderRadius: SET.radius, padding: SET.rowGap }}
                >
                  <Box className="bg-raise2 items-center justify-center" style={{ width: TILE, height: TILE, borderRadius: SET.rowGap }}>
                    <Icon name={d.icon} size={18} color={colour.hotText} />
                  </Box>
                  <Type step="chip" className="text-text" style={SET_TYPE.doc13} numberOfLines={3}>{d.label}</Type>
                  <Type step="tag" className="text-hotText">Read ›</Type>
                </Pressable>
              ))}
            </Box>
          </Sec>
          {/* M22 US17 (T077, T078): updates (Android APK copies only) and the widget guide.
              M25 L3d: "Check for updates" only on a build made for GitHub Releases, never a store build. */}
          <Sec label="App">
            <PanelGroup>
              {updaterShown(Platform.OS, distributionOf(Constants.expoConfig?.extra)) ? (
                <Link href="/settings/updates" asChild accessibilityLabel="Check for updates"><SetRow icon="download-outline" label="Check for updates" line="Android copies from GitHub only" /></Link>
              ) : null}
              <Link href="/settings/widgets" asChild accessibilityLabel="Widgets"><SetRow icon="grid-outline" label="Widgets" line="How to add SocialNet to your home screen" /></Link>
              {/* M25 L2: the licence notices of every open-source package the app ships. */}
              <Link href="/settings/licences" asChild accessibilityLabel="Open-source licences"><SetRow icon="star-outline" label="Open-source licences" /></Link>
            </PanelGroup>
          </Sec>
          {/* M9: gluestack's Modal at full size, as Consent's documents. */}
          <Modal isOpen={doc !== undefined} size="full" onClose={() => setDoc(undefined)}>
            <ModalBackdrop />
            <ModalContent className="w-full h-full rounded-none border-0 bg-background" style={{ padding: 0 }}>
              {doc !== undefined ? <LegalDoc text={LEGAL_TEXT[doc]} onClose={() => setDoc(undefined)} /> : null}
            </ModalContent>
          </Modal>
        </SetPage>
      )}
    </PushedPage>
  );
}
