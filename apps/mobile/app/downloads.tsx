/**
 * Downloads (US1, FR-004): every row, the budget, "remove finished", the mobile-data switch.
 * M10 (owner, 2026-09-27), after the reference: the settings sit behind the ⚙ in the header,
 * and an empty list is a picture and one line, with M6's action under it.
 */
import { useEffect, useState } from 'react';
import { FlatList } from '../src/ui/lib/flat-list';
import { Pressable } from '../src/ui/lib/pressable';
import { Toggle } from '../src/ui/Toggle';
import { Text } from '../src/ui/lib/text';
import { Box } from '../src/ui/lib/box';
import { Icon } from '../src/ui/Icon';
import { mb } from '../src/ui/DownloadButton';
import { useDownloads, useStores } from '../src/ui/providers';
import type { DownloadRow } from '../src/storage/types';
import { EmptyState } from '../src/ui/EmptyState';
import { hit } from '../src/design';
import { useColours } from '../src/ui/useColours';
import { PageHeader } from '../src/ui/PageHeader';
import { BarButton } from '../src/ui/TopBar';

const TAP = { minHeight: hit.min, minWidth: hit.min };

const BUDGETS = [200 * 1024 ** 2, 500 * 1024 ** 2, ...[1, 2, 4, 8].map((g) => g * 1024 ** 3)];

export default function DownloadsScreen(): React.ReactElement {
  const downloads = useDownloads();
  const stores = useStores();
  const c = useColours(stores.settings);
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
    <>
    {/* M16a T002: the ⚙ is on the app's own bar now (was the native header's right side). */}
    <PageHeader title="Downloads" right={(
      <BarButton label={settings ? 'Hide download settings' : 'Download settings'} onPress={() => setSettings((v) => !v)}>
        <Icon name="settings-outline" size={22} color={c.accent} />
      </BarButton>
    )} />
    <FlatList
      data={rows}
      keyExtractor={(r) => r.episodeId}
      contentContainerClassName="px-screen-x py-row gap-1.5 flex-grow"
      className="flex-1 bg-background"
      ListHeaderComponent={
        <>
        {settings ? (
        <Box className="gap-2 mb-2 bg-surface rounded-artwork p-section">
          <Text className="text-[15px] text-text">Used {mb(downloads.usedBytes())} of {mb(downloads.budgetBytes())}</Text>
          <Box className="flex-row gap-3 items-center flex-wrap">
            {BUDGETS.map((b) => (
              // M12 NEW-6: a 48 pt target (the chips were 27 pt) that says which size is chosen.
              <Pressable key={b} onPress={() => downloads.setBudgetBytes(b)} accessibilityRole="button" accessibilityState={{ selected: downloads.budgetBytes() === b }} className="justify-center" style={TAP}>
                <Text className={`border rounded-pill px-3 py-1.5 ${downloads.budgetBytes() === b ? 'bg-primary border-primary text-onPrimary' : 'border-separator text-text'}`}>{b < 1024 ** 3 ? `${b / 1024 ** 2} MB` : `${b / 1024 ** 3} GB`}</Text>
              </Pressable>
            ))}
          </Box>
          <Box className="flex-row gap-3 items-center flex-wrap">
            <Text className="text-[15px] text-text">Allow mobile data</Text>
            <Toggle value={downloads.allowMobile()} onChange={(v) => downloads.setAllowMobile(v)} label="Allow mobile data for downloads" />
          </Box>
          <Pressable onPress={() => void downloads.removeFinished()} accessibilityRole="button">
            <Text className="text-accent text-[15px] py-1">Remove finished downloads</Text>
          </Pressable>
        </Box>
        ) : null}
        </>
      }
      ListEmptyComponent={
        <Box className="items-center pt-24 gap-section">
          <Box className="w-28 h-28 rounded-pill bg-surface items-center justify-center" accessible={false}><Icon name="download-outline" size={44} color={c.muted} /></Box>
          <EmptyState surface="downloads" page />
        </Box>
      }
      renderItem={({ item }) => (
        <Box className="py-2 gap-0.5 border-b-hairline border-separator">
          <Text className="text-[15px] font-semibold text-text" numberOfLines={2}>{title(item.episodeId)}</Text>
          <Text className="text-muted">{state(item)}</Text>
          <Box className="flex-row gap-3 items-center flex-wrap">
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
          </Box>
        </Box>
      )}
    />
    </>
  );
}
