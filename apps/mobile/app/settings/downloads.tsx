// Download settings: space used, clear all, clear cache, auto-download and mobile-data switches.
/**
 * Downloads and cache (下载设置, M10): download queued episodes, mobile data, and clearing downloads.
 *
 * M17 T086 (`SettingsDownloads-B`): a white card first — "On this phone", the space used as a big
 * serif figure with the episode count, a yellow bar against the storage limit, then Clear
 * (outlined, same confirm) and Manage downloads (yellow, same /downloads link) side by side;
 * under a serif "When to download" the two switches in one card. Same prefs, same handlers.
 *
 * M21 US10 (T109): a "Cache" card — the size it would free, measured first (`cacheBytes`), and
 * "Clear cache", which asks with that size, then deletes the cache folder's entries and the saved
 * pages (`src/storage/clear-cache.ts`). Downloads are kept: they are not in the cache folder.
 *
 * M31 S-A (T060; design-pulse2 `settings-downloads--screen`, `--clear-cache-dialog`, `--clear-downloads-dialog`, `toast--settings-downloads`; Panel with a Stage-size value): "On this
 * phone" — the space used in Unbounded 56 with its unit at 22, the episode count in mono, an 8 tall bar (hot to violet) against the limit, "of a 2.0 GB storage limit", then **Clear
 * downloaded episodes** (quiet pill 40) and the hot-text link **Manage downloads ›** to /downloads. "Cache": the size in Unbounded 40 ("Measuring" while counting), "Pictures and saved
 * pages", the reassurance line and **Clear cache**. "When": the two most-used switches as large tiles (Download queued episodes; Allow mobile data for downloads — "Off · waits for Wi-Fi").
 * "Tidy up": Delete after playing and When storage is full, remove the oldest, as rows with switches in one group tile. Both clears ask first in the kit dialog (Clear is hot).
 */
import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { Box } from '@/ui/lib/box';
import { LinearGradient } from '@/design/tailwind';
import { colour } from '@/design';
import { getPref, setPref } from '@/settings/prefs';
import { mb } from '@/ui/episode/DownloadButton';
import { useDownloads, useStores, useToast } from '@/ui/shell/providers';
import { Toggle } from '@/ui/kit/Toggle';
import { plural } from '@socialmorning/social-core';
import { useConfirm } from '@/ui/kit/confirm';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { PanelGroup } from '@/ui/me/Panel';
import { cacheBytes, clearCache, phoneCacheEntries, sizeLabel } from '@/storage/clear-cache';
import { BigGrid, BigTile, Caps, Note, Sec, SetButton, SetCard, SetPage, SetRow } from '@/ui/settings/hub-parts';
import { SET, SET_TYPE } from '@/ui/settings/hub-measures';

const BAR = 8;

/** "1.2 GB" as the drawing sets it: the figure large, the unit smaller beside it, on one baseline. */
function BigSize(props: { label: string; figure: keyof Pick<typeof SET_TYPE, 'size56' | 'size40'>; unit: keyof Pick<typeof SET_TYPE, 'unit22' | 'unit18'> }): React.ReactElement {
  const [figure, unit] = props.label.split(' ');
  return (
    <Box className="flex-row items-end" style={{ gap: 10 }} accessible accessibilityLabel={props.label}>
      <Type step="figure" className="text-text" style={SET_TYPE[props.figure]} maxFontSizeMultiplier={1.3}>{figure ?? ''}</Type>
      {unit ? <Type step="lede" className="text-text font-bold" style={SET_TYPE[props.unit]} maxFontSizeMultiplier={1.3}>{unit}</Type> : null}
    </Box>
  );
}

export default function DownloadSettings(): React.ReactElement {
  const stores = useStores();
  const downloads = useDownloads();
  const toast = useToast();
  const [auto, setAuto] = useState(() => getPref(stores.settings, 'autoDownloadQueued'));
  const [mobile, setMobile] = useState(() => downloads.allowMobile());
  // M22 US17: downloads tidy themselves — both off by default.
  const [afterPlay, setAfterPlay] = useState(() => downloads.deleteAfterPlay());
  const [evict, setEvict] = useState(() => downloads.evictOldest());
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

  // M21 US10: measured after the first frame (the folder walk is synchronous), and after a clear.
  const [cache, setCache] = useState<number | undefined>();
  const measure = () => setCache(cacheBytes(phoneCacheEntries(), stores));
  useEffect(() => { const t = setTimeout(measure, 0); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const clearCacheNow = () => {
    const size = cacheBytes(phoneCacheEntries(), stores);
    setCache(size);
    confirm({
      title: 'Clear cache?',
      message: `${sizeLabel(size)} of pictures and saved pages. Downloaded episodes are kept.`,
      action: 'Clear',
      onConfirm: () => { const freed = clearCache(phoneCacheEntries(), stores); measure(); toast(`Cache cleared — ${sizeLabel(freed)} freed.`); },
    });
  };

  const budget = downloads.budgetBytes();
  const episodes = stores.downloads.list().filter((d) => d.state === 'complete').length;
  const share = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0;

  return (
    <PushedPage title="Downloads and cache" size={28}>
      {(layout) => (
        <SetPage layout={layout}>
          <Sec label="Phone">
            <SetCard testID="phone-card">
              <Caps hot>On this phone</Caps>
              <Box className="flex-row items-end justify-between">
                <BigSize label={sizeLabel(used)} figure="size56" unit="unit22" />
                <Type step="mono" className="text-text2" style={[SET_TYPE.mono13, { paddingBottom: SET.rowGap }]}>{plural(episodes, 'episode')}</Type>
              </Box>
              <Box testID="storage-bar" className="bg-raise2 overflow-hidden" style={{ height: BAR, borderRadius: BAR / 2 }} accessible={false}>
                <LinearGradient colors={[colour.hot, colour.violet]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: BAR, width: `${share}%` }} />
              </Box>
              <Type step="mono" className="text-text2" style={SET_TYPE.mono12}>{`of a ${mb(budget)} storage limit`}</Type>
              <Box className="flex-row items-center" style={{ gap: SET.tileGap, flexWrap: 'wrap' }}>
                <SetButton label="Clear downloaded episodes" accessibilityLabel={`Clear downloaded episodes, ${mb(used)}`} onPress={clearAll} />
                <Link href="/downloads" asChild accessibilityLabel="Manage downloads">
                  <SetButton kind="link" label="Manage downloads ›" accessibilityLabel="Manage downloads and storage limit" />
                </Link>
              </Box>
            </SetCard>
          </Sec>
          <Sec label="Cache">
            <SetCard testID="cache-card">
              <Box className="flex-row items-end" style={{ gap: SET.gap }}>
                {cache !== undefined ? <BigSize label={sizeLabel(cache)} figure="size40" unit="unit18" /> : <Type step="figure" className="text-text" style={SET_TYPE.size40}>Measuring</Type>}
                <Note>Pictures and saved pages</Note>
              </Box>
              <Note>Clearing it never removes downloaded episodes.</Note>
              <SetButton label="Clear cache" accessibilityLabel={`Clear cache, ${cache === undefined ? 'measuring' : sizeLabel(cache)}`} onPress={clearCacheNow} />
            </SetCard>
          </Sec>
          <Sec label="When">
            <BigGrid>
              <BigTile icon="list-outline" label="Download queued episodes" state={auto ? 'On' : 'Off'} on={auto} right={<Toggle value={auto} onChange={(v) => { setAuto(v); setPref(stores.settings, 'autoDownloadQueued', v); }} label="Download queued episodes" />} />
              <BigTile icon="wifi" label="Allow mobile data for downloads" state={mobile ? 'On' : 'Off · waits for Wi-Fi'} on={mobile} right={<Toggle value={mobile} onChange={(v) => { setMobile(v); downloads.setAllowMobile(v); }} label="Allow mobile data for downloads" />} />
            </BigGrid>
          </Sec>
          <Sec label="Tidy up">
            <PanelGroup>
              <SetRow icon="trash-outline" label="Delete after playing" line="A downloaded episode is removed when you finish it" right={<Toggle value={afterPlay} onChange={(v) => { setAfterPlay(v); downloads.setDeleteAfterPlay(v); }} label="Delete after playing" />} />
              <SetRow icon="albums-outline" label="When storage is full, remove the oldest" line="Starred episodes and ones you are part-way through are never removed" right={<Toggle value={evict} onChange={(v) => { setEvict(v); downloads.setEvictOldest(v); }} label="When storage is full, remove the oldest" />} />
            </PanelGroup>
          </Sec>
          {dialog}
        </SetPage>
      )}
    </PushedPage>
  );
}
