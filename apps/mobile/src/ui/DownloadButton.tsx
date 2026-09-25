/**
 * One control, every download state (US1 #1, #6): Download → Waiting… → 43 % · Cancel →
 * Downloaded 82 MB · Remove; Failed · Retry; a "use mobile data" choice when the
 * request would wait for Wi-Fi. Reads the manager through a subscription so progress
 * moves without polling from here.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDownloads, useStores, useToast } from './providers';
import type { DownloadRow } from '../storage/types';
import { colour } from '../design';

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
      <View style={styles.row}>
        <Pressable style={styles.button} onPress={() => request()} accessibilityRole="button" accessibilityLabel="Download this episode">
          <Text style={styles.buttonText}>{row?.state === 'failed' ? (row.error === 'budget' ? 'Not enough space · Retry' : 'Failed · Retry') : 'Download'}</Text>
        </Pressable>
        {askMobile ? (
          <Pressable onPress={() => request(true)} accessibilityRole="button"><Text style={styles.link}>Use mobile data</Text></Pressable>
        ) : (
          <Pressable onPress={() => setAskMobile(true)} accessibilityRole="button"><Text style={styles.muted}>Wi-Fi only</Text></Pressable>
        )}
      </View>
    );
  }
  if (row.state === 'complete') {
    return (
      <View style={styles.row}>
        <Text style={styles.done}>Downloaded · {mb(row.bytesTotal)}</Text>
        <Pressable onPress={() => downloads.remove(props.episodeId)} accessibilityRole="button" accessibilityLabel="Remove the download">
          <Text style={styles.link}>Remove</Text>
        </Pressable>
      </View>
    );
  }
  const pct = row.bytesTotal ? Math.floor((row.bytesDone / row.bytesTotal) * 100) : undefined;
  const label = row.state === 'waiting' ? 'Waiting…' : row.state === 'paused' ? `Paused at ${pct ?? 0} %` : pct === undefined ? 'Downloading…' : `${pct} %`;
  return (
    <View style={styles.row}>
      <Text style={styles.muted}>{label}{row.error === 'no-resume' ? ' · restarted (server refused resume)' : ''}</Text>
      <Pressable onPress={() => downloads.cancel(props.episodeId)} accessibilityRole="button" accessibilityLabel="Cancel the download">
        <Text style={styles.link}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 4 },
  button: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: colour.separator },
  buttonText: { fontWeight: '600', color: colour.text },
  // A statement of fact, not an action: muted. (Owner's K1 note, 2026-09-25.)
  done: { fontWeight: '600', color: colour.muted },
  link: { color: colour.accent, fontSize: 14 },
  muted: { color: colour.muted, fontSize: 14 },
});
