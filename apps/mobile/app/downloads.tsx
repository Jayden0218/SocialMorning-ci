// Downloaded episodes, space used, size limit and mobile-data switch.
/**
 * Downloads (US1, FR-004): every row, the budget, "remove finished", the mobile-data switch.
 * M10 (owner, 2026-09-27), after the reference: the settings sit behind the ⚙ in the header,
 * and an empty list is a picture and one line, with M6's action under it.
 *
 * M17 T049 (`Downloads-B`): a white card on top — the space used as a big serif figure over a
 * yellow fill bar, the budget as a pill track, the mobile-data switch — then the rows in serif
 * sections ("In progress", "Needs attention", "Downloaded") with artwork, the state, a thin
 * progress bar while downloading, and the actions as accent words on the right. B shows the
 * budget and the switch in the card, so they are always there now; the ⚙ keeps its toggle and
 * reveals "Remove finished downloads" at the card's foot. Every handler is unchanged.
 */
import { useEffect, useState } from 'react';
import { SectionList } from '@/ui/lib/section-list';
import { Pressable } from '@/ui/lib/pressable';
import { Toggle } from '@/ui/kit/Toggle';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Icon } from '@/ui/kit/Icon';
import { Artwork } from '@/ui/kit/Artwork';
import { Card, CardDivider } from '@/ui/kit/Card';
import { mb } from '@/ui/episode/DownloadButton';
import { useDownloads, useStores } from '@/ui/shell/providers';
import type { DownloadRow } from '@/storage/types';
import { EmptyState } from '@/ui/kit/EmptyState';
import { hit } from '@/design';
import { useColours } from '@/ui/kit/useColours';
import { PageHeader } from '@/ui/kit/PageHeader';
import { BarButton } from '@/ui/kit/TopBar';

const TAP = { minHeight: hit.min, minWidth: hit.min };
const ROW_TAP = { minHeight: hit.min };

/** A third of the row less the gaps; the grow fills what is left. */
const CHIP = { minHeight: hit.min, flexBasis: '30%' as const, flexGrow: 1 };
const BUDGETS = [200 * 1024 ** 2, 500 * 1024 ** 2, ...[1, 2, 4, 8].map((g) => g * 1024 ** 3)];

type Section = { key: 'progress' | 'attention' | 'done'; title: string; data: DownloadRow[] };

/** 0–100, or undefined while the size is unknown. */
const percent = (r: DownloadRow): number | undefined => (r.bytesTotal ? Math.min(100, Math.floor((r.bytesDone / r.bytesTotal) * 100)) : undefined);

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
    const pct = percent(r);
    const base = r.state === 'waiting' ? 'Waiting' : r.state === 'paused' ? `Paused · ${pct ?? 0} %` : `${pct ?? '…'} %`;
    // FR-002: the same honesty as the episode screen — a kill-restart says so here too.
    return r.error === 'no-resume' ? `${base} · restarted` : base;
  };

  const sections: Section[] = ([
    { key: 'progress', title: 'In progress', data: rows.filter((r) => r.state !== 'complete' && r.state !== 'failed') },
    { key: 'attention', title: 'Needs attention', data: rows.filter((r) => r.state === 'failed') },
    { key: 'done', title: 'Downloaded', data: rows.filter((r) => r.state === 'complete') },
  ] satisfies Section[]).filter((s) => s.data.length > 0);

  const used = downloads.usedBytes();
  const budget = downloads.budgetBytes();
  const fill = { width: `${budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0}%` } as const;

  return (
    <>
    {/* M16a T002: the ⚙ is on the app's own bar now (was the native header's right side). */}
    <PageHeader title="Downloads" right={(
      <BarButton label={settings ? 'Hide download settings' : 'Download settings'} onPress={() => setSettings((v) => !v)}>
        <Icon name="settings-outline" size={22} color={c.accent} />
      </BarButton>
    )} />
    <SectionList
      sections={sections}
      keyExtractor={(r) => r.episodeId}
      stickySectionHeadersEnabled={false}
      // Owner, 2026-10-04: with nothing downloaded the page stays still; it scrolls once there are episodes (or the settings are open).
      scrollEnabled={sections.length > 0 || settings}
      contentContainerClassName="px-screen-x pb-section flex-grow"
      className="flex-1 bg-background"
      ListHeaderComponent={
        <Card className="pt-section pb-1.5 mb-section">
          <Box className="flex-row items-baseline gap-gap flex-wrap">
            <Text className="text-text text-display font-display">{mb(used)}</Text>
            <Text className="text-muted text-body">{`used of ${mb(budget)}`}</Text>
          </Box>
          <Box className="h-2.5 rounded-pill bg-track overflow-hidden mt-row mb-row" accessible={false}>
            <Box className="h-full bg-primary" style={fill} />
          </Box>
          <Text className="text-muted text-xs mb-1.5">Budget</Text>
          {/* Owner, 2026-10-05: three to a row, so every size reads in full ("200 MB" was "200…"). */}
          <Box className="flex-row flex-wrap gap-1.5">
            {BUDGETS.map((b) => {
              const on = budget === b;
              return (
                // M12 NEW-6: a 48 pt target (the chips were 27 pt) that says which size is chosen.
                <Pressable key={b} onPress={() => downloads.setBudgetBytes(b)} accessibilityRole="button" accessibilityState={{ selected: on }} className={`rounded-pill items-center justify-center border ${on ? 'bg-primary border-primary' : 'bg-background border-border'}`} style={CHIP}>
                  <Text className={on ? 'text-onPrimary text-meta font-bold' : 'text-text text-meta font-medium'}>{b < 1024 ** 3 ? `${b / 1024 ** 2} MB` : `${b / 1024 ** 3} GB`}</Text>
                </Pressable>
              );
            })}
          </Box>
          <Box className="flex-row items-center justify-between gap-row mt-1.5">
            <Text className="text-text text-body flex-1">Allow mobile data</Text>
            <Toggle value={downloads.allowMobile()} onChange={(v) => downloads.setAllowMobile(v)} label="Allow mobile data for downloads" />
          </Box>
          {settings ? (
            <>
              <CardDivider />
              <Pressable onPress={() => void downloads.removeFinished()} accessibilityRole="button" className="justify-center" style={ROW_TAP}>
                <Text className="text-accent text-body font-bold">Remove finished downloads</Text>
              </Pressable>
            </>
          ) : null}
        </Card>
      }
      renderSectionHeader={({ section }) => (
        <Box className="flex-row items-baseline gap-1.5 mt-1">
          <Text className="text-text text-lg font-display" accessibilityRole="header">{section.title}</Text>
          <Text className="text-muted text-meta font-semibold">{String(section.data.length)}</Text>
        </Box>
      )}
      renderSectionFooter={() => <Box className="h-3.5" />}
      ListEmptyComponent={
        // Owner, 2026-10-04: closer under the card (was 64 pt down, a 112 pt disc) so it fits one screen.
        <Box className="items-center pt-gap gap-row">
          <Box className="w-20 h-20 rounded-pill bg-surface items-center justify-center" accessible={false}><Icon name="download-outline" size={32} color={c.muted} /></Box>
          <EmptyState surface="downloads" page />
        </Box>
      }
      renderItem={({ item }) => {
        const episode = stores.feeds.getEpisode(item.episodeId);
        const show = episode ? stores.feeds.getShow(episode.feedUrl) : undefined;
        const going = item.state !== 'complete' && item.state !== 'failed';
        const bar = { width: `${percent(item) ?? 0}%` } as const;
        return (
          <Box className="flex-row items-center gap-row py-2 border-b-hairline border-separator">
            <Artwork url={episode?.imageUrl ?? show?.imageUrl} size={52} name={show?.title ?? title(item.episodeId)} />
            <Box className="flex-1">
              <Text className="text-text text-body font-semibold" numberOfLines={1}>{title(item.episodeId)}</Text>
              <Text className="text-muted text-xs mt-0.5">{state(item)}</Text>
              {going ? (
                <Box className="h-1 rounded-pill bg-track overflow-hidden mt-1.5" accessible={false}>
                  <Box className="h-full bg-primary" style={bar} />
                </Box>
              ) : null}
            </Box>
            <Box className="flex-row gap-2.5 items-center">
              {item.state === 'complete' ? (
                <Pressable onPress={() => downloads.remove(item.episodeId)} accessibilityRole="button" className="justify-center px-0.5" style={TAP}><Text className="text-accent text-body font-bold">Remove</Text></Pressable>
              ) : item.state === 'failed' ? (
                <>
                  <Pressable onPress={() => downloads.request(item.episodeId)} accessibilityRole="button" className="justify-center px-0.5" style={TAP}><Text className="text-accent text-body font-bold">Retry</Text></Pressable>
                  {/* Build 5 (2026-09-21): a refused row had no way off the list but a retry that is refused again. */}
                  <Pressable onPress={() => downloads.remove(item.episodeId)} accessibilityRole="button" className="justify-center px-0.5" style={TAP}><Text className="text-accent text-body font-bold">Remove</Text></Pressable>
                </>
              ) : (
                <Pressable onPress={() => downloads.cancel(item.episodeId)} accessibilityRole="button" className="justify-center px-0.5" style={TAP}><Text className="text-accent text-body font-bold">Cancel</Text></Pressable>
              )}
            </Box>
          </Box>
        );
      }}
    />
    </>
  );
}
