// Downloaded episodes as a mosaic: in progress, needs attention, downloaded; a settings panel; select to delete.
/**
 * Downloads (US1, FR-004): every row, the budget, "remove finished", the mobile-data switch.
 * M10 (owner, 2026-09-27), after the reference: the settings sit behind the ⚙, and an empty list is a
 * picture and one line, with M6's action under it.
 *
 * M24 US17 (lane A3): "Select" picks several rows (a tick on each; the whole tile is the target) and a bar deletes
 * them together after one question ("Select all" / "Clear" beside it). Helpers: src/downloads/multi-select.ts.
 *
 * M31 W3-B (T041; design-pulse2 `downloads--screen`, `-empty`, `-settings`, `-select-mode`, `-delete-dialog`,
 * `toast--downloads`; "Layout: Mosaic"): a pushed page with the title bar low — "Downloads", "6 episodes · 151 MB of
 * 1 GB", a gear and a check circle (Select). The tiles (src/ui/downloads/DownloadTile.tsx) sit in three groups named
 * by an edge label — In progress, Needs attention, Downloaded. Tap a tile = the episode; long-press = Remove (a finished
 * or failed one) or Cancel (one still running); a failed tile has a Retry pill. The gear slides the settings panel over
 * the mosaic (Allow mobile data, the budget chips with a ring of how much is used, Remove finished downloads) and
 * becomes a ×. Select turns the title bar into the action bar: "n selected", Select all / Clear, "Delete n episodes"
 * (hot) and Done; Delete asks once (the kit dialog) and ends in "n downloads deleted.". Every handler is unchanged.
 */
import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { plural } from '@socialmorning/social-core';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Toggle } from '@/ui/kit/Toggle';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { EmptyState } from '@/ui/kit/EmptyState';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { useConfirm } from '@/ui/kit/confirm';
import { mb } from '@/ui/episode/DownloadButton';
import { DownloadRing } from '@/ui/downloads/DownloadRing';
import { DownloadTile, kindOf, type TileKind } from '@/ui/downloads/DownloadTile';
import { DOWNLOADS_PAGE, DOWNLOAD_RING, DOWNLOAD_TILE, downloadsType } from '@/ui/downloads/measures';
import { useDownloads, useStores, useToast } from '@/ui/shell/providers';
import type { DownloadRow } from '@/storage/types';
import { colour, hit, radius, spacing } from '@/design';
import { NONE, deleteLabel, keepListed, removeChosen, removedLine, toggleAll, toggleChosen } from '@/downloads/multi-select';

// M31 F8: decimal storage units, as drawn ("2.0 GB").
const BUDGETS = [200e6, 500e6, ...[1, 2, 4, 8].map((g) => g * 1e9)];
const budgetLabel = (b: number): string => (b < 1e9 ? `${Math.round(b / 1e6)} MB` : `${Math.round((b / 1e9) * 10) / 10} GB`);
type Section = { key: TileKind; title: string; data: DownloadRow[] };

/** 0–100, or undefined while the size is unknown. */
const percent = (r: DownloadRow): number | undefined => (r.bytesTotal ? Math.min(100, Math.floor((r.bytesDone / r.bytesTotal) * 100)) : undefined);

/** A row of the settings panel: a 34 icon square, the words, a detail, something at the end; raise fill, radius 20. */
function PanelRow(props: { icon: IconName; title: string; detail?: string; right?: React.ReactNode }): React.ReactElement {
  return (
    <Box className="flex-row items-center bg-raise" style={{ gap: spacing.row, paddingVertical: spacing.row, paddingHorizontal: DOWNLOADS_PAGE.panelPad, minHeight: DOWNLOADS_PAGE.rowMin, borderRadius: DOWNLOADS_PAGE.panelRadius }}>
      <Box className="items-center justify-center bg-raise2" style={{ width: DOWNLOADS_PAGE.rowIcon, height: DOWNLOADS_PAGE.rowIcon, borderRadius: radius.chip + 4 }}><Icon name={props.icon} size={18} color={colour.hotText} /></Box>
      <Box className="flex-1">
        <Type step="row" className="text-text">{props.title}</Type>
        {props.detail ? <Type step="caption" className="text-text2" style={{ marginTop: 2, ...downloadsType.detail }}>{props.detail}</Type> : null}
      </Box>
      {props.right}
    </Box>
  );
}

export default function DownloadsScreen(): React.ReactElement {
  const downloads = useDownloads();
  const stores = useStores();
  const { width } = useWindowDimensions();
  const [rows, setRows] = useState<DownloadRow[]>(() => stores.downloads.list());
  const [, force] = useState(0);
  const [settings, setSettings] = useState(false);
  useEffect(() => downloads.subscribe(() => { setRows(stores.downloads.list()); force((n) => n + 1); }), [downloads, stores]);
  // M24 US17: Select mode.
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(NONE);
  const [deleting, setDeleting] = useState(false);
  const [menu, setMenu] = useState<DownloadRow | undefined>();
  const [confirm, dialog] = useConfirm();
  const toast = useToast();
  const ids = rows.map((r) => r.episodeId);
  const idKey = ids.join('\n');
  useEffect(() => { setChosen((cur) => keepListed(cur, idKey === '' ? [] : idKey.split('\n'))); }, [idKey]);
  useEffect(() => { if (rows.length === 0) { setSelecting(false); setChosen(NONE); } }, [rows.length]);
  const leaveSelect = () => { setSelecting(false); setChosen(NONE); };
  const deleteChosen = () => {
    const list = [...chosen];
    if (list.length === 0) return;
    confirm({
      title: `${deleteLabel(list.length)}?`,
      message: 'The files leave this phone. Where you stopped, your queue and Updates stay.',
      action: 'Delete',
      onConfirm: () => {
        setDeleting(true);
        void removeChosen(list, (id) => downloads.remove(id)).then((r) => { setDeleting(false); leaveSelect(); toast(removedLine(r)); });
      },
    });
  };

  // M32 T091: the episode and show for each row are read when the list of rows changes, not on every render.
  const info = useMemo(() => new Map(idKey === '' ? [] : idKey.split('\n').map((id) => {
    const episode = stores.feeds.getEpisode(id);
    return [id, { episode, show: episode ? stores.feeds.getShow(episode.feedUrl) : undefined }] as const;
  })), [idKey, stores]);
  const title = (id: string) => info.get(id)?.episode?.title ?? id;
  const state = (r: DownloadRow) => {
    if (r.state === 'complete') return `Downloaded · ${mb(r.bytesTotal)}`;
    if (r.state === 'failed') return r.error === 'budget' ? 'Not enough space' : `Failed${r.error ? ` · ${r.error}` : ''}`;
    const pct = percent(r);
    const base = r.state === 'waiting' ? 'Waiting' : r.state === 'paused' ? `Paused · ${pct ?? 0} %` : `Downloading · ${pct ?? '…'} %`;
    // FR-002: the same honesty as the episode screen — a kill-restart says so here too.
    return r.error === 'no-resume' ? `${base} · restarted` : base;
  };

  const sections: Section[] = ([
    { key: 'progress', title: 'In progress', data: rows.filter((r) => kindOf(r) === 'progress') },
    { key: 'attention', title: 'Needs attention', data: rows.filter((r) => kindOf(r) === 'attention') },
    { key: 'done', title: 'Downloaded', data: rows.filter((r) => kindOf(r) === 'done') },
  ] satisfies Section[]).filter((s) => s.data.length > 0);

  const used = downloads.usedBytes();
  const budget = downloads.budgetBytes();
  const usedShare = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0;
  const finishedBytes = rows.filter((r) => r.state === 'complete').reduce((n, r) => n + (r.bytesTotal ?? 0), 0);
  const empty = rows.length === 0;
  const tileWidth = Math.floor((width - DOWNLOAD_TILE.lane - DOWNLOAD_TILE.right - DOWNLOAD_TILE.gap) / 2);
  const subtitle = selecting ? 'Downloads' : empty ? `${used === 0 ? '0' : mb(used)} of ${budgetLabel(budget)}` : `${plural(rows.length, 'episode')} · ${mb(used)} of ${budgetLabel(budget)}`;

  const settingsPanel = (
    <Box style={{ marginLeft: DOWNLOAD_TILE.lane, marginRight: DOWNLOAD_TILE.right, gap: DOWNLOADS_PAGE.panelGap }}>
      <PanelRow icon="wifi-outline" title="Allow mobile data" detail="Allow mobile data for downloads" right={<Toggle value={downloads.allowMobile()} onChange={(v) => downloads.setAllowMobile(v)} label="Allow mobile data for downloads" />} />
      <Box className="bg-raise" style={{ borderRadius: DOWNLOADS_PAGE.panelRadius, padding: DOWNLOADS_PAGE.panelPad, gap: DOWNLOADS_PAGE.panelGap }}>
        <Box className="flex-row justify-between items-center">
          <Type step="row" className="text-text">Budget</Type>
          <DownloadRing state="running" percent={usedShare} size={DOWNLOAD_RING.budgetSize} stroke={DOWNLOAD_RING.budgetStroke} label={`${usedShare}%`} />
        </Box>
        {/* Owner, 2026-10-05: three to a row, so every size reads in full ("200 MB" was "200…"). */}
        <Box className="flex-row flex-wrap" style={{ gap: DOWNLOADS_PAGE.chipGap }}>
          {BUDGETS.map((b) => {
            const on = budget === b;
            return (
              // M12 NEW-6: a 48 pt target (the chips were 27 pt) that says which size is chosen.
              <Pressable key={b} onPress={() => downloads.setBudgetBytes(b)} accessibilityRole="button" accessibilityLabel={budgetLabel(b)} accessibilityState={{ selected: on }} className={`items-center justify-center border ${on ? 'bg-text border-text' : 'bg-raise border-line'}`} style={{ flexBasis: '30%', flexGrow: 1, minHeight: hit.min, borderRadius: radius.pill }}>
                <Type step="mono" className={on ? 'text-void' : 'text-text'}>{budgetLabel(b)}</Type>
              </Pressable>
            );
          })}
        </Box>
      </Box>
      <Pressable onPress={() => void downloads.removeFinished()} accessibilityRole="button" accessibilityLabel="Remove finished downloads">
        <PanelRow icon="trash-outline" title="Remove finished downloads" detail={finishedBytes > 0 ? `Frees ${mb(finishedBytes)}` : 'Nothing to free yet'} right={<Icon name="chevron-forward" size={18} color={colour.text3} />} />
      </Pressable>
    </Box>
  );

  const bar = selecting ? (
    <Box className="flex-row" style={{ gap: spacing.row }}>
      <Box className="flex-1"><PulseButton label={chosen.size === ids.length ? 'Clear' : 'Select all'} kind="quiet" onPress={() => setChosen((cur) => toggleAll(cur, ids))} full /></Box>
      <Box style={{ flex: 1.5 }}><PulseButton label={deleteLabel(chosen.size)} kind="hot" onPress={() => { if (chosen.size > 0 && !deleting) deleteChosen(); }} disabled={chosen.size === 0 || deleting} busy={deleting} full /></Box>
      <PulseButton label="Done" kind="quiet" onPress={leaveSelect} />
    </Box>
  ) : undefined;

  return (
    <>
      <PushedPage
        title={selecting ? `${chosen.size} selected` : 'Downloads'}
        subtitle={subtitle}
        {...(selecting ? { onBack: null } : {})}
        actions={selecting ? [] : settings
          ? [{ icon: 'close' as const, label: 'Hide download settings', onPress: () => setSettings(false) }]
          : [
              { icon: 'settings-outline' as const, label: 'Download settings', onPress: () => setSettings(true) },
              ...(empty ? [] : [{ icon: 'checkmark-circle-outline' as const, label: 'Select', onPress: () => setSelecting(true) }]),
            ]}
        {...(bar ? { extra: bar, extraAbove: 60 } : {})}
      >
        {(layout) => (
          <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1, paddingTop: layout.top + DOWNLOADS_PAGE.top, paddingBottom: layout.reserve }} showsVerticalScrollIndicator={false} scrollEnabled={!empty || settings}>
            {settings ? (
              <>
                <EdgeLabel label="Settings" top={layout.top + DOWNLOADS_PAGE.top} />
                {settingsPanel}
              </>
            ) : null}
            {empty && !settings ? (
              <Box style={{ marginTop: DOWNLOADS_PAGE.emptyTop - DOWNLOADS_PAGE.top }}><EmptyState surface="downloads" page /></Box>
            ) : (
              <Box style={{ gap: DOWNLOADS_PAGE.sectionGap, ...(settings ? { opacity: 0.4, marginTop: spacing.block } : null) }} pointerEvents={settings ? 'none' : 'auto'}>
                {sections.filter((s) => !settings || s.key === 'done').map((section) => (
                  <Box key={section.key} style={{ minHeight: DOWNLOAD_TILE.height }}>
                    <EdgeLabel label={section.title} top={0} />
                    <Box className="flex-row flex-wrap" style={{ marginLeft: DOWNLOAD_TILE.lane, marginRight: DOWNLOAD_TILE.right, gap: DOWNLOAD_TILE.gap }}>
                      {section.data.map((item) => {
                        const { episode, show } = info.get(item.episodeId) ?? {};
                        return (
                          <DownloadTile
                            key={item.episodeId}
                            row={item}
                            title={title(item.episodeId)}
                            art={episode?.imageUrl ?? show?.imageUrl}
                            artName={show?.title ?? title(item.episodeId)}
                            state={state(item)}
                            percent={percent(item)}
                            width={tileWidth}
                            {...(selecting ? { select: { chosen: chosen.has(item.episodeId), onToggle: () => setChosen((cur) => toggleChosen(cur, item.episodeId)) } } : {})}
                            onOpen={() => router.push({ pathname: '/episode/[id]', params: { id: item.episodeId } })}
                            onMenu={() => setMenu(item)}
                            onRetry={() => downloads.request(item.episodeId)}
                          />
                        );
                      })}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </ScrollView>
        )}
      </PushedPage>
      {/* Long-press on a tile: Remove (finished or failed) or Cancel (still running). */}
      <ActionSheet open={menu !== undefined} onClose={() => setMenu(undefined)} label="Download menu" {...(menu ? { title: title(menu.episodeId) } : {})}>
        {menu?.state === 'complete' ? (
          <PulseButton label="Remove" kind="quiet" onPress={() => { const id = menu.episodeId; setMenu(undefined); void downloads.remove(id); }} full />
        ) : menu?.state === 'failed' ? (
          <PulseButton label="Remove" kind="quiet" onPress={() => { const id = menu.episodeId; setMenu(undefined); void downloads.remove(id); }} full />
        ) : menu ? (
          <PulseButton label="Cancel" kind="quiet" onPress={() => { const id = menu.episodeId; setMenu(undefined); downloads.cancel(id); }} full />
        ) : null}
      </ActionSheet>
      {dialog}
    </>
  );
}
