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
 */
import Constants from 'expo-constants';
import { Modal, ModalBackdrop, ModalContent } from '@/ui/lib/modal';
import { Image } from '@/ui/lib/image';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { useState } from 'react';
import { LEGAL_TEXT } from '@/legal/texts';
import { LegalDoc } from '@/ui/shell/LegalDoc';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { hit } from '@/design';
import { Platform } from 'react-native';
import { Card, CardDivider } from '@/ui/kit/Card';
import { LinkRow } from '@/ui/settings/rows';

type Doc = keyof typeof LEGAL_TEXT;
const ICON = { width: 64, height: 64 };
const TILE = { width: 36, height: 36 };
const CARD = { minHeight: hit.min };

const DOCS: { doc: Doc; icon: IconName; label: string }[] = [
  { doc: 'agreement', icon: 'document-outline', label: 'Service agreement' },
  { doc: 'privacy', icon: 'shield-checkmark-outline', label: 'Privacy policy' },
  { doc: 'community', icon: 'people-outline', label: 'Community guidelines' },
];

export default function AboutScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const [doc, setDoc] = useState<Doc | undefined>();
  return (
    <>
    {/* M17: B draws no big title here — the name beside the icon is the page's header. */}
    <PageHeader middle={<Box />} />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-section">
      <Box className="flex-row items-center gap-section mt-row">
        <Image source={require('../../assets/app-icon.png')} style={ICON} className="rounded-[14px]" accessibilityLabel="SocialNet" />
        <Box className="flex-1">
          <Text className="text-text text-hero font-display" accessibilityRole="header">SocialNet</Text>
          <Text className="text-muted text-xs mt-0.5">Version {Constants.expoConfig?.version ?? '?'}</Text>
        </Box>
      </Box>
      <Text className="text-text text-lg font-display mt-section">“Podcasts, with the people listening alongside you.”</Text>
      <Text className="text-muted text-body mt-row">Audio always streams from its publisher.</Text>
      <Eyebrow className="mt-section mb-row">The documents</Eyebrow>
      <Box className="flex-row gap-gap">
        {DOCS.map((d) => (
          <Pressable
            key={d.doc}
            onPress={() => setDoc(d.doc)}
            accessibilityRole="button"
            accessibilityLabel={d.label}
            className="flex-1 bg-surface border border-border rounded-row p-row gap-row"
            style={CARD}
          >
            <Box className="bg-accentTint rounded-row items-center justify-center" style={TILE}>
              <Icon name={d.icon} size={18} color={c.accent} />
            </Box>
            <Text className="text-text text-title font-display" numberOfLines={2}>{d.label}</Text>
            <Text className="text-accent text-xs font-bold">Read</Text>
          </Pressable>
        ))}
      </Box>
      {/* M22 US17 (T077, T078): updates (Android APK copies only) and the widget guide. */}
      <Box className="mt-section">
        <Card>
          {Platform.OS === 'android' ? (
            <>
              <LinkRow href="/settings/updates" icon="cloud-download-outline" label="Check for updates" />
              <CardDivider />
            </>
          ) : null}
          <LinkRow href="/settings/widgets" icon="apps-outline" label="Widgets" line="How to add SocialNet to your home screen" />
        </Card>
      </Box>
      {/* M9: gluestack's Modal at full size, as Consent's documents. */}
      <Modal isOpen={doc !== undefined} size="full" onClose={() => setDoc(undefined)}>
        <ModalBackdrop />
        <ModalContent className="w-full h-full p-0 rounded-none border-0 bg-background">
          {doc !== undefined ? <LegalDoc text={LEGAL_TEXT[doc]} onClose={() => setDoc(undefined)} /> : null}
        </ModalContent>
      </Modal>
    </ScrollView>
    </>
  );
}
