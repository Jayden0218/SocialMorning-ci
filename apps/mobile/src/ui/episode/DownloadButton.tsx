// Download tile showing every state: waiting, percent, done, failed, remove.
/**
 * One control, every download state (US1 #1, #6): Download → Waiting… → 43 % · Cancel →
 * Downloaded 82 MB · Remove; Failed · Retry; a "use mobile data" choice when the
 * request would wait for Wi-Fi. Reads the manager through a subscription so progress
 * moves without polling from here.
 *
 * M31 W3-A (T040; design-pulse2 `episode--more-sheet`): the control is one kit `PulseTile` whose mono detail line carries the state —
 * "Wi-Fi only", "Waiting…", "Downloading · 42 %", "Paused at 42 %", "Downloaded · 82 MB", "Download failed — retry", "Not enough
 * space — retry download" — and "Cancel the download" / "Remove the download" replace the tile's action while it is active / done
 * (same names as before). The mobile-data choice ("Use mobile data instead" → "Download now on mobile data") is a wide tile
 * under it. `useDownload` is the logic; `DownloadTiles` draws it into a sheet's grid, `DownloadButton` is the standalone grid
 * (the shared episode-row sheet uses it).
 */
import { useEffect, useState } from 'react';
import { PulseTile, PulseTileGrid } from '@/ui/kit/PulseTile';
import type { IconName } from '@/ui/kit/Icon';
import { useDownloads, useStores, useToast } from '@/ui/shell/providers';
import type { DownloadRow } from '@/storage/types';

export function mb(bytes: number | undefined): string {
  if (bytes === undefined) return '';
  // M12 FR-011 (B11): nothing is 0 MB — the floor of 1 made an empty Downloads say "Used 1 MB".
  if (bytes <= 0) return '0 MB';
  // M31 F8: decimal units as drawn — a 2 000 000 000 byte limit is "2.0 GB".
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}

export type DownloadTileSpec = { icon: IconName; label: string; detail?: string; accessibilityLabel: string; act: 'request' | 'cancel' | 'remove' };

/** The tile for a download row (pure — tested): what it says, and what a tap does. */
export function downloadTile(row: DownloadRow | undefined, askMobile: boolean): DownloadTileSpec {
  if (!row || row.state === 'failed') {
    const detail = row?.state === 'failed' ? (row.error === 'budget' ? 'Not enough space — retry download' : 'Download failed — retry') : askMobile ? undefined : 'Wi-Fi only';
    return { icon: 'download-outline', label: 'Download', ...(detail !== undefined ? { detail } : {}), accessibilityLabel: 'Download this episode', act: 'request' };
  }
  if (row.state === 'complete') {
    return { icon: 'trash-outline', label: 'Remove download', detail: `Downloaded · ${mb(row.bytesTotal)}`, accessibilityLabel: 'Remove the download', act: 'remove' };
  }
  const pct = row.bytesTotal ? Math.floor((row.bytesDone / row.bytesTotal) * 100) : undefined;
  const state = row.state === 'waiting' ? 'Waiting…' : row.state === 'paused' ? `Paused at ${pct ?? 0} %` : pct === undefined ? 'Downloading…' : `Downloading · ${pct} %`;
  return { icon: 'close', label: 'Cancel download', detail: row.error === 'no-resume' ? `${state} · restarted` : state, accessibilityLabel: 'Cancel the download', act: 'cancel' };
}

export function useDownload(episodeId: string): { tile: DownloadTileSpec; run: () => void; mobile: { label: string; run: () => void } | undefined } {
  const downloads = useDownloads();
  const stores = useStores();
  const toast = useToast();
  const [row, setRow] = useState<DownloadRow | undefined>(() => stores.downloads.get(episodeId));
  const [askMobile, setAskMobile] = useState(false);

  useEffect(() => {
    // A8: no state update after unmount or after the episode changed.
    let live = true;
    const read = () => { if (live) setRow(stores.downloads.get(episodeId)); };
    read();
    void downloads.verify(episodeId).then((removed) => { if (removed) read(); });
    const off = downloads.subscribe(read);
    return () => { live = false; off(); };
  }, [downloads, stores, episodeId]);

  async function request(allowMobile = false) {
    const r = await downloads.request(episodeId, { allowMobile });
    if (r.kind === 'budget') toast(`Not enough space: ${mb(r.usedBytes)} of ${mb(r.budgetBytes)} used. Remove finished downloads to free space.`);
    if (r.kind === 'no-episode') toast('This episode is no longer in the feed.');
    setAskMobile(false);
  }
  const tile = downloadTile(row, askMobile);
  const run = () => {
    if (tile.act === 'request') void request();
    else if (tile.act === 'remove') void downloads.remove(episodeId);
    else void downloads.cancel(episodeId);
  };
  const mobile = tile.act === 'request'
    ? (askMobile ? { label: 'Download now on mobile data', run: () => void request(true) } : { label: 'Use mobile data instead', run: () => setAskMobile(true) })
    : undefined;
  return { tile, run, mobile };
}

/** The Download tile, and — while it would wait for Wi-Fi — the wide mobile-data tile under it. `before` / `after` sit around them in the grid. */
export function DownloadTiles(props: { episodeId: string; beside?: React.ReactNode }): React.ReactElement {
  const { tile, run, mobile } = useDownload(props.episodeId);
  return (
    <>
      <PulseTile icon={tile.icon} label={tile.label} {...(tile.detail !== undefined ? { detail: tile.detail } : {})} accessibilityLabel={tile.accessibilityLabel} onPress={run} />
      {props.beside}
      {mobile ? <PulseTile icon="wifi" label={mobile.label} accessibilityLabel={mobile.label} onPress={mobile.run} wide /> : null}
    </>
  );
}

/** Standalone: the Download tile (and the mobile-data one) in a grid of their own. */
export function DownloadButton(props: { episodeId: string }): React.ReactElement {
  return <PulseTileGrid><DownloadTiles episodeId={props.episodeId} /></PulseTileGrid>;
}
