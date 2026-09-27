import type { Transcript, TranscriptLine } from './types';

/**
 * Transcripts (research R5): SRT, WebVTT, Podcasting 2.0 JSON segments → timed lines;
 * HTML / plain text → `{ text }`. A malformed SRT/VTT block is skipped and the rest kept
 * (Principle IV, guard G6); an unreadable JSON falls back to text.
 */
export function parseTranscript(body: string, mimeType: string): Transcript {
  const mime = mimeType.toLowerCase().split(';')[0]!.trim();
  if (mime === 'application/srt' || mime === 'text/srt' || mime === 'application/x-subrip') return { lines: parseSrt(body) };
  if (mime === 'text/vtt') return { lines: parseVtt(body) };
  if (mime === 'application/json') {
    try {
      const lines = parseJsonSegments(JSON.parse(body));
      if (lines) return { lines };
    } catch { /* fall through to text */ }
    return { text: body };
  }
  if (mime === 'text/html') return { text: stripHtml(body) };
  return { text: body };
}

const TIME = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})|(\d{1,2}):(\d{2})[.,](\d{1,3})/;

function timeMs(s: string): number | undefined {
  const m = TIME.exec(s.trim());
  if (!m) return undefined;
  if (m[1] !== undefined) return ((+m[1] * 60 + +m[2]!) * 60 + +m[3]!) * 1000 + +m[4]!.padEnd(3, '0');
  return (+m[5]! * 60 + +m[6]!) * 1000 + +m[7]!.padEnd(3, '0');
}

function parseCueBlocks(body: string, skipHeader: boolean): TranscriptLine[] {
  const text = body.replace(/\r\n?/g, '\n');
  const blocks = text.split(/\n{2,}/);
  const lines: TranscriptLine[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!.trim();
    if (!block) continue;
    if (skipHeader && i === 0 && block.startsWith('WEBVTT')) continue;
    const rows = block.split('\n');
    const arrowAt = rows.findIndex((r) => r.includes('-->'));
    if (arrowAt === -1) continue; // not a cue (or a malformed one): skip, keep going
    // `findIndex` found '-->', so both halves exist.
    const parts = rows[arrowAt]!.split('-->');
    const startMs = timeMs(parts[0] as string);
    const endMs = timeMs((parts[1] as string).trim().split(' ')[0] as string);
    if (startMs === undefined) continue;
    const bodyText = rows.slice(arrowAt + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (!bodyText) continue;
    const speakerMatch = /^([^:]{1,40}):\s+(.*)$/.exec(bodyText);
    lines.push({
      startMs,
      ...(endMs !== undefined ? { endMs } : {}),
      ...(speakerMatch ? { speaker: speakerMatch[1]!.trim(), text: speakerMatch[2]! } : { text: bodyText }),
    });
  }
  return lines;
}

export function parseSrt(body: string): TranscriptLine[] {
  return parseCueBlocks(body, false);
}

export function parseVtt(body: string): TranscriptLine[] {
  return parseCueBlocks(body, true);
}

function parseJsonSegments(json: unknown): TranscriptLine[] | undefined {
  const root = json as { segments?: unknown } | null;
  if (!root || typeof root !== 'object' || !Array.isArray(root.segments)) return undefined;
  const lines: TranscriptLine[] = [];
  for (const raw of root.segments) {
    const s = raw as { startTime?: unknown; endTime?: unknown; speaker?: unknown; body?: unknown };
    if (!s || typeof s !== 'object' || typeof s.startTime !== 'number' || typeof s.body !== 'string' || !s.body.trim()) continue;
    lines.push({
      startMs: Math.round(s.startTime * 1000),
      ...(typeof s.endTime === 'number' ? { endMs: Math.round(s.endTime * 1000) } : {}),
      ...(typeof s.speaker === 'string' && s.speaker ? { speaker: s.speaker } : {}),
      text: s.body.trim(),
    });
  }
  return lines;
}

function stripHtml(html: string): string {
  return html
    .replace(/<\s*(br|p|div|li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Index of the line containing `positionMs` (or the last one started before it). */
export function currentLine(lines: readonly TranscriptLine[], positionMs: number): number | undefined {
  let found: number | undefined;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.startMs <= positionMs) found = i;
    else break;
  }
  return found;
}
