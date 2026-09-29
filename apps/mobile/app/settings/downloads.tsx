/** Downloads and cache (下载设置, M10): download queued episodes, mobile data, and clearing downloads. */
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { getPref, setPref } from '../../src/settings/prefs';
import { mb } from '../../src/ui/DownloadButton';
import { useDownloads, useStores, useToast } from '../../src/ui/providers';
import { ActionRow, Divider, LinkRow, SwitchRow } from '../../src/ui/settings/rows';
import { plural } from '@socialmorning/social-core';

export default function DownloadSettings(): React.ReactElement {
  const stores = useStores();
  const downloads = useDownloads();
  const toast = useToast();
  const [auto, setAuto] = useState(() => getPref(stores.settings, 'autoDownloadQueued'));
  const [mobile, setMobile] = useState(() => downloads.allowMobile());
  const [used, setUsed] = useState(() => downloads.usedBytes());
  useEffect(() => downloads.subscribe(() => setUsed(downloads.usedBytes())), [downloads]);

  const clearAll = () => {
    const done = stores.downloads.list().filter((d) => d.state === 'complete');
    if (done.length === 0) { toast('There are no downloaded episodes.'); return; }
    Alert.alert('Clear downloaded episodes?', `${plural(done.length, 'episode')}, ${mb(used)}. Your places in them are kept.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => { void Promise.all(done.map((d) => downloads.remove(d.episodeId))).then(() => toast('Downloads cleared.')); } },
    ]);
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-row">
      <Stack.Screen options={{ title: 'Downloads and cache' }} />
      <SwitchRow icon="list-outline" label="Download queued episodes" line="An episode starts downloading when you add it to the queue" value={auto} onChange={(v) => { setAuto(v); setPref(stores.settings, 'autoDownloadQueued', v); }} />
      <SwitchRow icon="cellular-outline" label="Allow mobile data for downloads" line="Off: downloads wait for Wi-Fi" value={mobile} onChange={(v) => { setMobile(v); downloads.setAllowMobile(v); }} />
      <Divider />
      <ActionRow onPress={clearAll} icon="trash-outline" label="Clear downloaded episodes" value={mb(used)} />
      <LinkRow href="/downloads" icon="folder-open-outline" label="Manage downloads and storage limit" />
    </ScrollView>
  );
}
