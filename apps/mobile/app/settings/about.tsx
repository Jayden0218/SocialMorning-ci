/**
 * About SocialNet (关于我们, M10): the version, and the three documents — service
 * agreement, privacy policy, community guidelines — opened in the app (M6 FR-027's
 * privacy policy and community rules live here now).
 */
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { Image, Modal, ScrollView, Text, View } from 'react-native';
import { useState } from 'react';
import { LEGAL_TEXT } from '../../src/legal/texts';
import { LegalDoc } from '../../src/ui/LegalDoc';
import { ActionRow } from '../../src/ui/settings/rows';

type Doc = keyof typeof LEGAL_TEXT;
const ICON = { width: 88, height: 88 };

export default function AboutScreen(): React.ReactElement {
  const [doc, setDoc] = useState<Doc | undefined>();
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-section">
      <Stack.Screen options={{ title: 'About SocialNet' }} />
      <View className="items-center gap-row mb-section">
        <Image source={require('../../assets/app-icon.png')} style={ICON} className="rounded-artwork" accessibilityLabel="SocialNet" />
        <Text className="text-text text-lg font-bold">SocialNet</Text>
        <Text className="text-muted text-xs">Version {Constants.expoConfig?.version ?? '?'}</Text>
        <Text className="text-muted text-xs text-center">Podcasts, with the people listening alongside you. Audio always streams from its publisher.</Text>
      </View>
      <ActionRow onPress={() => setDoc('agreement')} icon="document-outline" label="Service agreement" />
      <ActionRow onPress={() => setDoc('privacy')} icon="shield-checkmark-outline" label="Privacy policy" />
      <ActionRow onPress={() => setDoc('community')} icon="people-outline" label="Community guidelines" />
      <Modal visible={doc !== undefined} animationType="slide" onRequestClose={() => setDoc(undefined)}>
        {doc !== undefined ? <LegalDoc text={LEGAL_TEXT[doc]} onClose={() => setDoc(undefined)} /> : null}
      </Modal>
    </ScrollView>
  );
}
