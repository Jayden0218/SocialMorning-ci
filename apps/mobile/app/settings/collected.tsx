/**
 * Personal information we collect (个人信息收集清单, M10), after the reference: groups of
 * cards, each with how many items are held; tapping a card opens its details — purpose,
 * when it is collected, and what exactly. Counts are live, from this phone.
 */
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { colour, hit } from '../../src/design';
import { listFavourites } from '../../src/me/favourites';
import { listMoments } from '../../src/me/moments';
import { readHistory } from '../../src/search/history';
import { collectedList, type CollectedItem } from '../../src/settings/collected';
import { useSocial } from '../../src/social/context';
import { Icon } from '../../src/ui/Icon';
import { useStores } from '../../src/ui/providers';

const TAP = { minHeight: hit.min, minWidth: hit.min };

export default function CollectedScreen(): React.ReactElement {
  const stores = useStores();
  const { listener } = useSocial();
  const [open, setOpen] = useState<CollectedItem | undefined>();
  const groups = collectedList({
    signedIn: listener !== undefined,
    history: stores.positions.all().length,
    favourites: listFavourites(stores.settings).length,
    moments: listMoments(stores.settings).length,
    searches: readHistory(stores.settings).length,
    subscriptions: stores.subscriptions.list().length,
  });
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-section pb-24">
      <Stack.Screen options={{ title: 'Information we collect' }} />
      {groups.map((g) => (
        <View key={g.title} className="mb-section">
          <Text className="text-text text-base font-bold text-center" accessibilityRole="header">{g.title}</Text>
          <Text className="text-muted text-xs text-center mt-1 mb-section">{g.line}</Text>
          {g.items.map((i) => (
            <Pressable key={i.id} onPress={() => setOpen(i)} accessibilityRole="button" accessibilityLabel={`${i.title}${i.count !== undefined ? `, ${i.count} held` : ''}. ${i.purpose}. Details`} className="border border-separator rounded-artwork p-section mb-row">
              <View className="flex-row items-start justify-between">
                <Text className="text-text text-sm font-semibold flex-1">{i.title}</Text>
                {i.count !== undefined ? <Text className="text-muted text-xs bg-surface rounded-pill px-row py-1">{i.count} held</Text> : null}
              </View>
              <Text className="text-muted text-xs mt-1">{i.purpose}</Text>
              <Text className="text-accent text-sm mt-row">Details</Text>
            </Pressable>
          ))}
        </View>
      ))}
      <Text className="text-muted text-xs text-center">To offer these features SocialNet keeps the information above, and nothing else. Counts are from this phone and may lag the server.</Text>
      <Modal visible={open !== undefined} transparent animationType="slide" onRequestClose={() => setOpen(undefined)}>
        <View className="flex-1 bg-scrim justify-end">
          <View className="bg-background rounded-t-artwork p-screen-x pb-24 gap-section">
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <Text className="text-text text-lg font-bold" accessibilityRole="header">{open?.title}</Text>
                {open?.count !== undefined ? <Text className="text-accent text-xs mt-1">{open.count} held</Text> : null}
              </View>
              <Pressable onPress={() => setOpen(undefined)} accessibilityRole="button" accessibilityLabel="Close" className="items-center justify-center" style={TAP}>
                <Icon name="close" size={22} color={colour.muted} />
              </Pressable>
            </View>
            <View><Text className="text-muted text-xs">Purpose</Text><Text className="text-text text-sm">{open?.purpose}</Text></View>
            <View><Text className="text-muted text-xs">When it is collected</Text><Text className="text-text text-sm">{open?.when}</Text></View>
            <View><Text className="text-muted text-xs">What exactly</Text><Text className="text-text text-sm">{open?.scope}</Text></View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
