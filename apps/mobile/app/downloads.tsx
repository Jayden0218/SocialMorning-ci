/** Downloads (US1, FR-004): every row, the budget, "remove finished", the mobile-data switch. */
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { mb } from '../src/ui/DownloadButton';
import { useDownloads, useStores } from '../src/ui/providers';
import type { DownloadRow } from '../src/storage/types';

const BUDGETS = [200 * 1024 ** 2, 500 * 1024 ** 2, ...[1, 2, 4, 8].map((g) => g * 1024 ** 3)];

export default function DownloadsScreen(): React.ReactElement {
  const downloads = useDownloads();
  const stores = useStores();
  const [rows, setRows] = useState<DownloadRow[]>(() => stores.downloads.list());
  const [, force] = useState(0);
  useEffect(() => downloads.subscribe(() => { setRows(stores.downloads.list()); force((n) => n + 1); }), [downloads, stores]);

  const title = (id: string) => stores.feeds.getEpisode(id)?.title ?? id;
  const state = (r: DownloadRow) => {
    if (r.state === 'complete') return `Downloaded · ${mb(r.bytesTotal)}`;
    if (r.state === 'failed') return r.error === 'budget' ? 'Not enough space' : `Failed${r.error ? ` · ${r.error}` : ''}`;
    const pct = r.bytesTotal ? Math.floor((r.bytesDone / r.bytesTotal) * 100) : undefined;
    return r.state === 'waiting' ? 'Waiting' : r.state === 'paused' ? `Paused · ${pct ?? 0} %` : `${pct ?? '…'} %`;
  };

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.episodeId}
      contentContainerStyle={styles.body}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.line}>Used {mb(downloads.usedBytes())} of {mb(downloads.budgetBytes())}</Text>
          <View style={styles.rowWrap}>
            {BUDGETS.map((b) => (
              <Pressable key={b} onPress={() => downloads.setBudgetBytes(b)} accessibilityRole="button">
                <Text style={[styles.chip, downloads.budgetBytes() === b && styles.chipOn]}>{b < 1024 ** 3 ? `${b / 1024 ** 2} MB` : `${b / 1024 ** 3} GB`}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.rowWrap}>
            <Text style={styles.line}>Allow mobile data</Text>
            <Switch value={downloads.allowMobile()} onValueChange={(v) => downloads.setAllowMobile(v)} />
          </View>
          <Pressable onPress={() => void downloads.removeFinished()} accessibilityRole="button">
            <Text style={styles.link}>Remove finished downloads</Text>
          </Pressable>
        </View>
      }
      ListEmptyComponent={<Text style={styles.muted}>Nothing downloaded yet.</Text>}
      renderItem={({ item }) => (
        <View style={styles.item}>
          <Text style={styles.title} numberOfLines={2}>{title(item.episodeId)}</Text>
          <Text style={styles.muted}>{state(item)}</Text>
          <View style={styles.rowWrap}>
            {item.state === 'complete' ? (
              <Pressable onPress={() => downloads.remove(item.episodeId)} accessibilityRole="button"><Text style={styles.link}>Remove</Text></Pressable>
            ) : item.state === 'failed' ? (
              <Pressable onPress={() => downloads.request(item.episodeId)} accessibilityRole="button"><Text style={styles.link}>Retry</Text></Pressable>
            ) : (
              <Pressable onPress={() => downloads.cancel(item.episodeId)} accessibilityRole="button"><Text style={styles.link}>Cancel</Text></Pressable>
            )}
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  body: { padding: 12, gap: 6 },
  header: { gap: 8, marginBottom: 8 },
  line: { fontSize: 15 },
  rowWrap: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: '#999', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, color: '#333' },
  chipOn: { backgroundColor: '#222', color: '#fff', borderColor: '#222' },
  link: { color: '#0645ad', fontSize: 15, paddingVertical: 4 },
  muted: { color: '#666' },
  item: { paddingVertical: 8, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  title: { fontSize: 15, fontWeight: '600' },
});
