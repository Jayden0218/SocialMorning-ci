/**
 * Import or export subscriptions (导入或导出订阅列表, M10). Export shares an OPML file's text
 * through the phone's share sheet; import takes OPML pasted in and subscribes to every
 * feed in it that you do not already follow, then syncs (M8).
 */
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Share, Text, TextInput } from 'react-native';
import { useColours } from '../../src/ui/useColours';
import { fromOpml, toOpml } from '../../src/settings/opml';
import { Button } from '../../src/ui/Button';
import { useStores, useSubscriptionSync, useToast } from '../../src/ui/providers';

export default function OpmlScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const sync = useSubscriptionSync();
  const toast = useToast();
  const [text, setText] = useState('');
  const found = fromOpml(text);
  const fresh = found.filter((u) => !stores.subscriptions.has(u));

  const exportAll = () => {
    const shows = stores.subscriptions.list().map(({ feedUrl }) => ({ feedUrl, ...(stores.feeds.getShow(feedUrl)?.title ? { title: stores.feeds.getShow(feedUrl)!.title } : {}) }));
    if (shows.length === 0) { toast('You have no subscriptions to export.'); return; }
    void Share.share({ title: 'SocialNet subscriptions.opml', message: toOpml(shows, new Date()) });
  };
  const importAll = () => {
    const now = Date.now();
    for (const u of fresh) stores.subscriptions.add(u, now);
    sync.push();
    toast(`Subscribed to ${fresh.length} show${fresh.length === 1 ? '' : 's'}.`);
    setText('');
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-section gap-section" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Import or export' }} />
      <Text className="text-text text-base font-bold" accessibilityRole="header">Export</Text>
      <Text className="text-muted text-sm">Share your {stores.subscriptions.list().length} subscriptions as OPML, to keep or to open in another app.</Text>
      <Button label="Export subscriptions" onPress={exportAll} />
      <Text className="text-text text-base font-bold mt-section" accessibilityRole="header">Import</Text>
      <Text className="text-muted text-sm">Export OPML from your other app, then paste it here.</Text>
      <TextInput value={text} onChangeText={setText} multiline placeholder="Paste OPML here" placeholderTextColor={c.muted} autoCorrect={false} autoCapitalize="none"
        className="bg-surface rounded-row p-row text-text text-xs min-h-32" accessibilityLabel="OPML to import" />
      {text.trim() !== '' ? <Text className="text-muted text-sm">{found.length} show{found.length === 1 ? '' : 's'} found, {fresh.length} new.</Text> : null}
      <Button label={fresh.length > 0 ? `Subscribe to ${fresh.length}` : 'Nothing new to import'} onPress={importAll} disabled={fresh.length === 0} />
    </ScrollView>
  );
}
