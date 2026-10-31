// Fetches and caches an episode's chapters and transcript.
/**
 * Chapters and transcripts (US5, FR-021..023, research R5): fetched once per episode,
 * parsed by player-core, cached in `episode_extras`. Never blocks playback; a failure
 * is a row with `error` and a message in its own pane. Prefer a timed transcript
 * (srt > vtt > json), else the first html/text one.
 */
import { parseChapters, parseTranscript, type Chapter, type Transcript } from '@socialmorning/player-core';
import { FEED_TIMEOUT_MS, readFeedText } from '@socialmorning/feed-parser';
import type { CachedEpisode, ExtrasStore } from '@/storage/types';

export type Extras = { chapters?: Chapter[]; transcript?: Transcript; error?: string };

export type ExtrasDeps = {
  fetch: (url: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string>; headers?: { get(name: string): string | null } }>;
  store: ExtrasStore;
  now: () => number;
  /** Re-fetch after this long (default 7 days). */
  maxAgeMs?: number;
};

/** M32 A5: publisher-controlled files get the feed's deadline and a smaller size cap. */
export const EXTRAS_MAX_BYTES = 5 * 1024 * 1024;

/** Fetch one extras file whole: 8 s for headers and body together, refused over the cap. */
async function guardedText(deps: ExtrasDeps, url: string): Promise<{ res: Awaited<ReturnType<ExtrasDeps['fetch']>>; text: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), FEED_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      (async () => {
        const res = await deps.fetch(url);
        if (!res.ok) return { res, text: '' };
        const text = await readFeedText(res, (label, fatal) => new TextDecoder(label, { fatal }), EXTRAS_MAX_BYTES, { stream: false });
        return { res, text };
      })(),
      late,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const PREFERENCE = ['application/srt', 'application/x-subrip', 'text/srt', 'text/vtt', 'application/json', 'text/html', 'text/plain'];

export function pickTranscript(transcripts: readonly { url: string; type?: string }[]): { url: string; type: string } | undefined {
  const typed = transcripts.map((t) => ({ url: t.url, type: (t.type ?? '').toLowerCase().split(';')[0]!.trim() }));
  for (const mime of PREFERENCE) {
    const hit = typed.find((t) => t.type === mime);
    if (hit) return hit;
  }
  const first = typed[0];
  return first ? { url: first.url, type: first.type || 'text/plain' } : undefined;
}

export function readExtras(store: ExtrasStore, episodeId: string): Extras | undefined {
  const row = store.get(episodeId);
  if (!row) return undefined;
  try {
    return {
      ...(row.chaptersJson ? { chapters: JSON.parse(row.chaptersJson) as Chapter[] } : {}),
      ...(row.transcriptJson ? { transcript: JSON.parse(row.transcriptJson) as Transcript } : {}),
      ...(row.error ? { error: row.error } : {}),
    };
  } catch {
    return { error: 'corrupt cache' };
  }
}

export async function fetchExtras(deps: ExtrasDeps, episode: Pick<CachedEpisode, 'id' | 'chaptersUrl' | 'transcripts'>): Promise<Extras> {
  const cached = deps.store.get(episode.id);
  if (cached && deps.now() - cached.fetchedAt < (deps.maxAgeMs ?? 7 * 86_400_000) && !cached.error) {
    return readExtras(deps.store, episode.id) ?? {};
  }
  const out: Extras = {};
  const errors: string[] = [];

  if (episode.chaptersUrl) {
    try {
      const { res, text } = await guardedText(deps, episode.chaptersUrl);
      if (!res.ok) throw new Error(`chapters ${res.status}`);
      out.chapters = parseChapters(JSON.parse(text));
    } catch (e) {
      errors.push(`chapters: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const pick = pickTranscript(episode.transcripts);
  if (pick) {
    try {
      const { res, text } = await guardedText(deps, pick.url);
      if (!res.ok) throw new Error(`transcript ${res.status}`);
      const mime = res.headers?.get('content-type') ?? pick.type;
      const t = parseTranscript(text, pick.type === 'text/plain' && mime ? mime : pick.type);
      out.transcript = t;
    } catch (e) {
      errors.push(`transcript: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (errors.length) out.error = errors.join('; ');
  deps.store.put({
    episodeId: episode.id,
    ...(out.chapters ? { chaptersJson: JSON.stringify(out.chapters) } : {}),
    ...(out.transcript ? { transcriptJson: JSON.stringify(out.transcript) } : {}),
    fetchedAt: deps.now(),
    ...(out.error ? { error: out.error } : {}),
  });
  return out;
}
