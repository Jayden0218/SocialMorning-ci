/**
 * One control, every download state (US1 #1, #6): Download → Waiting… → 43 % · Cancel →
 * Downloaded 82 MB · Remove; Failed · Retry; a "use mobile data" choice when the
 * request would wait for Wi-Fi. Reads the manager through a subscription so progress
 * moves without polling from here.
 *
 * M17 (`EpisodeMoreSheet-B`): one row of two tiles (`SheetTile`) in the ⋯ sheet's grid — the
 * state on the left (Download · Wi-Fi only, Downloading · 43 %, Downloaded 82 MB), its second
 * action on the right (mobile data, Cancel, Remove). Same names, same handlers.
 */
import { useEffect, useState } from 'react';
import { SheetTile, TileRow } from '@/ui/queue/QueueButtons';
import { useColours } from '@/ui/kit/useColours';
import { useDownloads, useStores, useToast } from '@/ui/shell/providers';
import type { DownloadRow } from '@/storage/types';

export function mb(bytes: number | undefined): string {
  if (bytes === undefined) return '';
  // M12 FR-011 (B11): nothing is 0 MB — the floor of 1 made an empty Downloads say "Used 1 MB".
  if (bytes <= 0) return '0 MB';
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

export function DownloadButton(props: { episodeId: string }): React.ReactElement {
  const downloads = useDownloads();
  const stores = useStores();
  const toast = useToast();
  const [row, setRow] = useState<DownloadRow | undefined>(() => stores.downloads.get(props.episodeId));
  const [askMobile, setAskMobile] = useState(false);
  const c = useColours(stores.settings);

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

  // M12 FR-032 made these full-width rows; M17 makes them a row of two tiles.
  if (!row || row.state === 'failed') {
    const label = row?.state === 'failed' ? (row.error === 'budget' ? 'Not enough space — retry download' : 'Download failed — retry') : 'Download';
    return (
      <TileRow>
        <SheetTile icon="download-outline" label={label} {...(askMobile ? {} : { detail: 'Wi-Fi only' })} iconColour={c.accent} onPress={() => void request()} accessibilityLabel="Download this episode" />
        {askMobile
          ? <SheetTile icon="cellular-outline" label="Download now on mobile data" iconColour={c.accent} tone="accent" onPress={() => void request(true)} />
          : <SheetTile icon="cellular-outline" label="Use mobile data instead" iconColour={c.muted} tone="muted" onPress={() => setAskMobile(true)} />}
      </TileRow>
    );
  }
  if (row.state === 'complete') {
    return (
      <TileRow>
        {/* A statement of fact, not an action: muted. (Owner's K1 note, 2026-09-25.) */}
        <SheetTile icon="checkmark-circle-outline" label="Downloaded" detail={mb(row.bytesTotal)} iconColour={c.muted} tone="muted" />
        <SheetTile icon="trash-outline" label="Remove download" iconColour={c.accent} tone="accent" onPress={() => void downloads.remove(props.episodeId)} accessibilityLabel="Remove the download" />
      </TileRow>
    );
  }
  const pct = row.bytesTotal ? Math.floor((row.bytesDone / row.bytesTotal) * 100) : undefined;
  const label = row.state === 'waiting' ? 'Waiting…' : row.state === 'paused' ? `Paused at ${pct ?? 0} %` : pct === undefined ? 'Downloading…' : `Downloading · ${pct} %`;
  return (
    <TileRow>
      <SheetTile icon="cloud-download-outline" label={label} {...(row.error === 'no-resume' ? { detail: 'restarted' } : {})} iconColour={c.muted} tone="muted" />
      <SheetTile icon="close-circle-outline" label="Cancel download" iconColour={c.accent} tone="accent" onPress={() => void downloads.cancel(props.episodeId)} accessibilityLabel="Cancel the download" />
    </TileRow>
  );
}
