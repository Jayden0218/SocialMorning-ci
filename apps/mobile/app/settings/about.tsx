/**
 * About SocialNet (关于我们, M10): the version, and the three documents — service
 * agreement, privacy policy, community guidelines — opened in the app (M6 FR-027's
 * privacy policy and community rules live here now).
 */
import Constants from 'expo-constants';
import { Modal, ModalBackdrop, ModalContent } from '../../src/ui/lib/modal';
import { Image } from '../../src/ui/lib/image';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { useState } from 'react';
import { LEGAL_TEXT } from '../../src/legal/texts';
import { LegalDoc } from '../../src/ui/LegalDoc';
import { ActionRow } from '../../src/ui/settings/rows';
import { PageHeader } from '../../src/ui/PageHeader';

type Doc = keyof typeof LEGAL_TEXT;
const ICON = { width: 88, height: 88 };

export default function AboutScreen(): React.ReactElement {
  const [doc, setDoc] = useState<Doc | undefined>();
  return (
    <>
    <PageHeader title="About SocialNet" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-section">
      <Box className="items-center gap-row mb-section">
        <Image source={require('../../assets/app-icon.png')} style={ICON} className="rounded-artwork" accessibilityLabel="SocialNet" />
        <Text className="text-text text-lg font-bold">SocialNet</Text>
        <Text className="text-muted text-xs">Version {Constants.expoConfig?.version ?? '?'}</Text>
        <Text className="text-muted text-xs text-center">Podcasts, with the people listening alongside you. Audio always streams from its publisher.</Text>
      </Box>
      <ActionRow onPress={() => setDoc('agreement')} icon="document-outline" label="Service agreement" />
      <ActionRow onPress={() => setDoc('privacy')} icon="shield-checkmark-outline" label="Privacy policy" />
      <ActionRow onPress={() => setDoc('community')} icon="people-outline" label="Community guidelines" />
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
