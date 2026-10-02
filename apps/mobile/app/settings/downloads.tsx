/** Downloads and cache (下载设置, M10): download queued episodes, mobile data, and clearing downloads. */
import { useEffect, useState } from 'react';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { getPref, setPref } from '../../src/settings/prefs';
import { mb } from '../../src/ui/DownloadButton';
import { useDownloads, useStores, useToast } from '../../src/ui/providers';
import { ActionRow, Divider, LinkRow, SwitchRow } from '../../src/ui/settings/rows';
import { plural } from '@socialmorning/social-core';
import { useConfirm } from '../../src/ui/confirm';
import { PageHeader } from '../../src/ui/PageHeader';

export default function DownloadSettings(): React.ReactElement {
  const stores = useStores();
  const downloads = useDownloads();
  const toast = useToast();
  const [auto, setAuto] = useState(() => getPref(stores.settings, 'autoDownloadQueued'));
  const [mobile, setMobile] = useState(() => downloads.allowMobile());
  const [used, setUsed] = useState(() => downloads.usedBytes());
  useEffect(() => downloads.subscribe(() => setUsed(downloads.usedBytes())), [downloads]);
  // M16a T003 (FR-013): the app's own dialog, not the iOS alert.
  const [confirm, dialog] = useConfirm();

  const clearAll = () => {
    const done = stores.downloads.list().filter((d) => d.state === 'complete');
    if (done.length === 0) { toast('There are no downloaded episodes.'); return; }
    confirm({
      title: 'Clear downloaded episodes?',
      message: `${plural(done.length, 'episode')}, ${mb(used)}. Your places in them are kept.`,
      action: 'Clear',
      onConfirm: () => { void Promise.all(done.map((d) => downloads.remove(d.episodeId))).then(() => toast('Downloads cleared.')); },
    });
  };

  return (
    <>
    <PageHeader title="Downloads and cache" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-row">
      <SwitchRow icon="list-outline" label="Download queued episodes" line="An episode starts downloading when you add it to the queue" value={auto} onChange={(v) => { setAuto(v); setPref(stores.settings, 'autoDownloadQueued', v); }} />
      <SwitchRow icon="cellular-outline" label="Allow mobile data for downloads" line="Off: downloads wait for Wi-Fi" value={mobile} onChange={(v) => { setMobile(v); downloads.setAllowMobile(v); }} />
      <Divider />
      <ActionRow onPress={clearAll} icon="trash-outline" label="Clear downloaded episodes" value={mb(used)} />
      <LinkRow href="/downloads" icon="folder-open-outline" label="Manage downloads and storage limit" />
    </ScrollView>
    {dialog}
    </>
  );
}
