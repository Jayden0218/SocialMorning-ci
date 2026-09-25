/** Downloads (US1, FR-004): every row, the budget, "remove finished", the mobile-data switch. */
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { mb } from '../src/ui/DownloadButton';
import { useDownloads, useStores } from '../src/ui/providers';
import type { DownloadRow } from '../src/storage/types';
import { EmptyState } from '../src/ui/EmptyState';
import { colour } from '../src/design';

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
    const base = r.state === 'waiting' ? 'Waiting' : r.state === 'paused' ? `Paused · ${pct ?? 0} %` : `${pct ?? '…'} %`;
    // FR-002: the same honesty as the episode screen — a kill-restart says so here too.
    return r.error === 'no-resume' ? `${base} · restarted` : base;
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
            <Switch value={downloads.allowMobile()} onValueChange={(v) => downloads.setAllowMobile(v)} accessibilityLabel="Allow mobile data for downloads" accessibilityRole="switch" accessibilityState={{ checked: downloads.allowMobile() }} />
          </View>
          <Pressable onPress={() => void downloads.removeFinished()} accessibilityRole="button">
            <Text style={styles.link}>Remove finished downloads</Text>
          </Pressable>
        </View>
      }
      ListEmptyComponent={<EmptyState surface="downloads" />}
      renderItem={({ item }) => (
        <View style={styles.item}>
          <Text style={styles.title} numberOfLines={2}>{title(item.episodeId)}</Text>
          <Text style={styles.muted}>{state(item)}</Text>
          <View style={styles.rowWrap}>
            {item.state === 'complete' ? (
              <Pressable onPress={() => downloads.remove(item.episodeId)} accessibilityRole="button"><Text style={styles.link}>Remove</Text></Pressable>
            ) : item.state === 'failed' ? (
              <>
                <Pressable onPress={() => downloads.request(item.episodeId)} accessibilityRole="button"><Text style={styles.link}>Retry</Text></Pressable>
                {/* Build 5 (2026-09-21): a refused row had no way off the list but a retry that is refused again. */}
                <Pressable onPress={() => downloads.remove(item.episodeId)} accessibilityRole="button"><Text style={styles.link}>Remove</Text></Pressable>
              </>
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
  line: { fontSize: 15, color: colour.text },
  rowWrap: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: colour.separator, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, color: colour.text },
  chipOn: { backgroundColor: colour.accent, color: colour.text, borderColor: colour.accent },
  link: { color: colour.accent, fontSize: 15, paddingVertical: 4 },
  muted: { color: colour.muted },
  item: { paddingVertical: 8, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colour.separator },
  title: { fontSize: 15, fontWeight: '600', color: colour.text },
});
