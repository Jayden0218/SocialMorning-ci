/**
 * One control, every download state (US1 #1, #6): Download → Waiting… → 43 % · Cancel →
 * Downloaded 82 MB · Remove; Failed · Retry; a "use mobile data" choice when the
 * request would wait for Wi-Fi. Reads the manager through a subscription so progress
 * moves without polling from here.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useDownloads, useStores, useToast } from './providers';
import type { DownloadRow } from '../storage/types';

export function mb(bytes: number | undefined): string {
  if (bytes === undefined) return '';
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

export function DownloadButton(props: { episodeId: string }): React.ReactElement {
  const downloads = useDownloads();
  const stores = useStores();
  const toast = useToast();
  const [row, setRow] = useState<DownloadRow | undefined>(() => stores.downloads.get(props.episodeId));
  const [askMobile, setAskMobile] = useState(false);

  useEffect(() => {
    const read = () => setRow(stores.downloads.get(props.episodeId));
    read();
    void downloads.verify(props.episodeId).then((removed) => { if (removed) read(); });
    return downloads.subscribe(read);
  }, [downloads, stores, props.episodeId]);

  async function request(allowMobile = false) {
    const r = await downloads.request(props.episodeId, { allowMobile });
    if (r.kind === 'budget') toast(`Not enough space: ${mb(r.usedBytes)} of ${mb(r.budgetBytes)} used. Remove finished downloads to free space.`);
    if (r.kind === 'no-episode') toast('This episode is no longer in the feed.');
    setAskMobile(false);
  }

  if (!row || row.state === 'failed') {
    return (
      <View className="flex-row items-center gap-3.5 my-1">
        <Pressable className="py-2 px-4 rounded-pill border border-separator" onPress={() => request()} accessibilityRole="button" accessibilityLabel="Download this episode">
          <Text className="font-semibold text-text">{row?.state === 'failed' ? (row.error === 'budget' ? 'Not enough space · Retry' : 'Failed · Retry') : 'Download'}</Text>
        </Pressable>
        {askMobile ? (
          <Pressable onPress={() => request(true)} accessibilityRole="button"><Text className="text-accent text-[14px]">Use mobile data</Text></Pressable>
        ) : (
          <Pressable onPress={() => setAskMobile(true)} accessibilityRole="button"><Text className="text-muted text-[14px]">Wi-Fi only</Text></Pressable>
        )}
      </View>
    );
  }
  if (row.state === 'complete') {
    return (
      <View className="flex-row items-center gap-3.5 my-1">
        {/* A statement of fact, not an action: muted. (Owner's K1 note, 2026-09-25.) */}
        <Text className="font-semibold text-muted">Downloaded · {mb(row.bytesTotal)}</Text>
        <Pressable onPress={() => downloads.remove(props.episodeId)} accessibilityRole="button" accessibilityLabel="Remove the download">
          <Text className="text-accent text-[14px]">Remove</Text>
        </Pressable>
      </View>
    );
  }
  const pct = row.bytesTotal ? Math.floor((row.bytesDone / row.bytesTotal) * 100) : undefined;
  const label = row.state === 'waiting' ? 'Waiting…' : row.state === 'paused' ? `Paused at ${pct ?? 0} %` : pct === undefined ? 'Downloading…' : `${pct} %`;
  return (
    <View className="flex-row items-center gap-3.5 my-1">
      <Text className="text-muted text-[14px]">{label}{row.error === 'no-resume' ? ' · restarted (server refused resume)' : ''}</Text>
      <Pressable onPress={() => downloads.cancel(props.episodeId)} accessibilityRole="button" accessibilityLabel="Cancel the download">
        <Text className="text-accent text-[14px]">Cancel</Text>
      </Pressable>
    </View>
  );
}
