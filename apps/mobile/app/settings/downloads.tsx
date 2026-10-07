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
 */
import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { getPref, setPref } from '@/settings/prefs';
import { mb } from '@/ui/episode/DownloadButton';
import { useDownloads, useStores, useToast } from '@/ui/shell/providers';
import { SwitchRow } from '@/ui/settings/rows';
import { Button } from '@/ui/kit/Button';
import { Card, CardDivider } from '@/ui/kit/Card';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { plural } from '@socialmorning/social-core';
import { useConfirm } from '@/ui/kit/confirm';
import { PageHeader } from '@/ui/kit/PageHeader';
import { cacheBytes, clearCache, phoneCacheEntries, sizeLabel } from '@/storage/clear-cache';

const TAP = { minHeight: hit.min };

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
  const fill = { width: `${budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0}%` } as const;

  return (
    <>
    <PageHeader title="Downloads and cache" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-row pb-24">
      <Card className="py-section mb-section">
        <Eyebrow accent>On this phone</Eyebrow>
        <Box className="flex-row items-baseline justify-between gap-gap mt-row">
          <Text className="text-text text-display font-display">{mb(used)}</Text>
          <Text className="text-muted text-meta">{plural(episodes, 'episode')}</Text>
        </Box>
        <Box className="h-2.5 rounded-pill bg-track overflow-hidden mt-row" accessible={false}>
          <Box className="h-full bg-primary" style={fill} />
        </Box>
        <Text className="text-muted text-xs mt-row">{`of a ${mb(budget)} storage limit`}</Text>
        <Box className="flex-row gap-gap mt-section">
          <Button kind="secondary" label="Clear downloaded episodes" accessibilityLabel={`Clear downloaded episodes, ${mb(used)}`} onPress={clearAll} className="flex-1" />
          <Link href="/downloads" asChild>
            <Pressable accessibilityRole="link" accessibilityLabel="Manage downloads and storage limit" className="flex-1 px-section rounded-pill bg-primary items-center justify-center" style={TAP}>
              <Text className="text-onPrimary text-body font-bold text-center">Manage downloads</Text>
            </Pressable>
          </Link>
        </Box>
      </Card>
      <Card className="py-section mb-section">
        <Eyebrow accent>Cache</Eyebrow>
        <Box className="flex-row items-baseline justify-between gap-gap mt-row">
          <Text className="text-text text-display font-display">{cache !== undefined ? sizeLabel(cache) : 'Measuring'}</Text>
          <Text className="text-muted text-meta">Pictures and saved pages</Text>
        </Box>
        <Text className="text-muted text-xs mt-row">Clearing it never removes downloaded episodes.</Text>
        <Button kind="secondary" label="Clear cache" accessibilityLabel={`Clear cache, ${cache === undefined ? 'measuring' : sizeLabel(cache)}`} onPress={clearCacheNow} className="mt-section" />
      </Card>
      <Text className="text-text text-base font-display-semibold mb-row" accessibilityRole="header">When to download</Text>
      <Card>
        <SwitchRow icon="list-outline" label="Download queued episodes" line="An episode starts downloading when you add it to the queue" value={auto} onChange={(v) => { setAuto(v); setPref(stores.settings, 'autoDownloadQueued', v); }} />
        <CardDivider />
        <SwitchRow icon="cellular-outline" label="Allow mobile data for downloads" line="Off: downloads wait for Wi-Fi" value={mobile} onChange={(v) => { setMobile(v); downloads.setAllowMobile(v); }} />
      </Card>
      <Text className="text-text text-base font-display-semibold mt-section mb-row" accessibilityRole="header">Tidy up</Text>
      <Card>
        <SwitchRow icon="trash-outline" label="Delete after playing" line="A downloaded episode is removed when you finish it" value={afterPlay} onChange={(v) => { setAfterPlay(v); downloads.setDeleteAfterPlay(v); }} />
        <CardDivider />
        <SwitchRow icon="albums-outline" label="When storage is full, remove the oldest" line="Starred episodes and ones you are part-way through are never removed" value={evict} onChange={(v) => { setEvict(v); downloads.setEvictOldest(v); }} />
      </Card>
    </ScrollView>
    {dialog}
    </>
  );
}
