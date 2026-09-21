import type { DownloadCandidate, NetworkKind } from './types';

/**
 * FR-004 / research R9: a download may start only if what is already used plus the
 * one in flight plus this one fits the budget. `expectedBytes` is undefined until the
 * first progress event — then only the used bytes are checked. Guard G7: the in-flight
 * download counts.
 */
export function canStartDownload(usedBytes: number, expectedBytes: number | undefined, budgetBytes: number): boolean {
  if (!(budgetBytes > 0)) return false;
  return usedBytes + (expectedBytes ?? 0) <= budgetBytes;
}

/** Bytes that count against the budget: complete downloads plus the one in flight. */
export function usedBytesOf(downloads: readonly { state: string; bytesTotal?: number; bytesDone?: number }[]): number {
  let used = 0;
  for (const d of downloads) {
    if (d.state === 'complete') used += d.bytesTotal ?? 0;
    else if (d.state === 'downloading') used += d.bytesTotal ?? d.bytesDone ?? 0;

  }
  return used;
}

/**
 * FR-001a / FR-005: which waiting (or paused) download may run now. One at a time —
 * if any row is `downloading`, nothing. Otherwise the earliest-requested row that the
 * network allows: any on Wi-Fi; on cellular only rows with `allowMobile` or the global
 * flag; none when offline.
 */
export function nextDownload(
  downloads: readonly DownloadCandidate[],
  network: NetworkKind,
  allowMobileGlobal: boolean,
): string | undefined {
  if (network === 'none') return undefined;
  if (downloads.some((d) => d.state === 'downloading')) return undefined;
  const eligible = downloads
    .filter((d) => d.state === 'waiting' || d.state === 'paused')
    .filter((d) => network === 'wifi' || d.allowMobile || allowMobileGlobal)
    .sort((a, b) => a.requestedAt - b.requestedAt);
  return eligible[0]?.episodeId;
}
