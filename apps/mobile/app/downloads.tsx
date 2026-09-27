/**
 * Downloads (US1, FR-004): every row, the budget, "remove finished", the mobile-data switch.
 * M10 (owner, 2026-09-27), after the reference: the settings sit behind the ⚙ in the header,
 * and an empty list is a picture and one line, with M6's action under it.
 */
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Switch, Text, View } from 'react-native';
import { mb } from '../src/ui/DownloadButton';
import { useDownloads, useStores } from '../src/ui/providers';
import type { DownloadRow } from '../src/storage/types';
import { EmptyState } from '../src/ui/EmptyState';
import { colour, hit } from '../src/design';

const TAP = { minHeight: hit.min, minWidth: hit.min };

const BUDGETS = [200 * 1024 ** 2, 500 * 1024 ** 2, ...[1, 2, 4, 8].map((g) => g * 1024 ** 3)];

export default function DownloadsScreen(): React.ReactElement {
  const downloads = useDownloads();
  const stores = useStores();
  const [rows, setRows] = useState<DownloadRow[]>(() => stores.downloads.list());
  const [, force] = useState(0);
  const [settings, setSettings] = useState(false);
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
      contentContainerClassName="p-3 gap-1.5 flex-grow"
      className="flex-1 bg-background"
      ListHeaderComponent={
        <>
        <Stack.Screen options={{ headerRight: () => (
          <Pressable onPress={() => setSettings((v) => !v)} accessibilityRole="button" accessibilityLabel="Download settings" accessibilityState={{ expanded: settings }} className="items-center justify-center" style={TAP}>
            <Text className="text-accent text-lg">⚙</Text>
          </Pressable>
        ) }} />
        {settings ? (
        <View className="gap-2 mb-2 bg-surface rounded-artwork p-section">
          <Text className="text-[15px] text-text">Used {mb(downloads.usedBytes())} of {mb(downloads.budgetBytes())}</Text>
          <View className="flex-row gap-3 items-center flex-wrap">
            {BUDGETS.map((b) => (
              <Pressable key={b} onPress={() => downloads.setBudgetBytes(b)} accessibilityRole="button">
                <Text className={`border rounded-pill px-2.5 py-1 ${downloads.budgetBytes() === b ? 'bg-primary border-primary text-onPrimary' : 'border-separator text-text'}`}>{b < 1024 ** 3 ? `${b / 1024 ** 2} MB` : `${b / 1024 ** 3} GB`}</Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row gap-3 items-center flex-wrap">
            <Text className="text-[15px] text-text">Allow mobile data</Text>
            <Switch trackColor={{ false: colour.separator, true: colour.primary }} thumbColor={colour.background} value={downloads.allowMobile()} onValueChange={(v) => downloads.setAllowMobile(v)} accessibilityLabel="Allow mobile data for downloads" accessibilityRole="switch" accessibilityState={{ checked: downloads.allowMobile() }} />
          </View>
          <Pressable onPress={() => void downloads.removeFinished()} accessibilityRole="button">
            <Text className="text-accent text-[15px] py-1">Remove finished downloads</Text>
          </Pressable>
        </View>
        ) : null}
        </>
      }
      ListEmptyComponent={
        <View className="items-center pt-24 gap-section">
          <View className="w-28 h-28 rounded-pill bg-surface items-center justify-center" accessible={false}><Text className="text-text text-lg">⬇️</Text></View>
          <EmptyState surface="downloads" />
        </View>
      }
      renderItem={({ item }) => (
        <View className="py-2 gap-0.5 border-b-hairline border-separator">
          <Text className="text-[15px] font-semibold text-text" numberOfLines={2}>{title(item.episodeId)}</Text>
          <Text className="text-muted">{state(item)}</Text>
          <View className="flex-row gap-3 items-center flex-wrap">
            {item.state === 'complete' ? (
              <Pressable onPress={() => downloads.remove(item.episodeId)} accessibilityRole="button"><Text className="text-accent text-[15px] py-1">Remove</Text></Pressable>
            ) : item.state === 'failed' ? (
              <>
                <Pressable onPress={() => downloads.request(item.episodeId)} accessibilityRole="button"><Text className="text-accent text-[15px] py-1">Retry</Text></Pressable>
                {/* Build 5 (2026-09-21): a refused row had no way off the list but a retry that is refused again. */}
                <Pressable onPress={() => downloads.remove(item.episodeId)} accessibilityRole="button"><Text className="text-accent text-[15px] py-1">Remove</Text></Pressable>
              </>
            ) : (
              <Pressable onPress={() => downloads.cancel(item.episodeId)} accessibilityRole="button"><Text className="text-accent text-[15px] py-1">Cancel</Text></Pressable>
            )}
          </View>
        </View>
      )}
    />
  );
}
