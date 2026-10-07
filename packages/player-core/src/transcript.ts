// Reads transcripts in SRT, VTT, JSON or text and finds the current line.
import type { Transcript, TranscriptLine } from './types';

/**
 * Transcripts (research R5): SRT, WebVTT, Podcasting 2.0 JSON segments → timed lines;
 * HTML / plain text → `{ text }`. A malformed SRT/VTT block is skipped and the rest kept
 * (Principle IV, guard G6); an unreadable JSON falls back to text.
 *
 * M23 US11: the body decides before the label — publishers serve SRT as `text/plain` and VTT
 * as `application/srt` — so a body shaped like SRT or VTT is read as timed. VTT speakers come
 * from `<v Name>`; the "Name: text" guess is SRT-only (in VTT it split ordinary sentences).
 * Entities are decoded, and lines are sorted by start so `currentLine` can binary-search.
 */
export function parseTranscript(body: string, mimeType: string): Transcript {
  const mime = mimeType.toLowerCase().split(';')[0]!.trim();
  if (mime === 'application/json') {
    try {
      const lines = parseJsonSegments(JSON.parse(body));
      if (lines) return { lines: sortLines(lines) };
    } catch { /* fall through to text */ }
    return { text: body };
  }
  const shape = timedShape(body);
  if (shape === 'vtt') return { lines: parseVtt(body) };
  if (shape === 'srt') return { lines: parseSrt(body) };
  if (mime === 'application/srt' || mime === 'text/srt' || mime === 'application/x-subrip') return { lines: parseSrt(body) };
  if (mime === 'text/vtt') return { lines: parseVtt(body) };
  if (mime === 'text/html') return { text: stripHtml(body) };
  return { text: body };
}

/** What the body itself looks like: a `WEBVTT` header, or an SRT first cue (index line, then timing). */
function timedShape(body: string): 'vtt' | 'srt' | undefined {
  const head = body.replace(/^\uFEFF/, '').trimStart().slice(0, 400);
  if (/^WEBVTT(?:[ \t]|\r?\n|$)/.test(head)) return 'vtt';
  if (/^\d+[ \t]*\r?\n[ \t]*\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}[ \t]*-->/.test(head)) return 'srt';
  return undefined;
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** `&amp;`, `&#39;`, `&#x2019;` … → the character; an unknown entity is left as written. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** By start time; equal starts keep their file order (Array.prototype.sort is stable). */
function sortLines(lines: TranscriptLine[]): TranscriptLine[] {
  return lines.sort((a, b) => a.startMs - b.startMs);
}

const TIME = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})|(\d{1,2}):(\d{2})[.,](\d{1,3})/;

function timeMs(s: string): number | undefined {
  const m = TIME.exec(s.trim());
  if (!m) return undefined;
  if (m[1] !== undefined) return ((+m[1] * 60 + +m[2]!) * 60 + +m[3]!) * 1000 + +m[4]!.padEnd(3, '0');
  return (+m[5]! * 60 + +m[6]!) * 1000 + +m[7]!.padEnd(3, '0');
}

function parseCueBlocks(body: string, kind: 'srt' | 'vtt'): TranscriptLine[] {
  const skipHeader = kind === 'vtt';
  const text = body.replace(/\r\n?/g, '\n');
  const blocks = text.split(/\n{2,}/);
  const lines: TranscriptLine[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!.trim();
    if (!block) continue;
    if (skipHeader && i === 0 && block.replace(/^\uFEFF/, '').startsWith('WEBVTT')) continue;
    const rows = block.split('\n');
    const arrowAt = rows.findIndex((r) => r.includes('-->'));
    if (arrowAt === -1) continue; // not a cue (or a malformed one): skip, keep going
    // `findIndex` found '-->', so both halves exist.
    const parts = rows[arrowAt]!.split('-->');
    const startMs = timeMs(parts[0] as string);
    const endMs = timeMs((parts[1] as string).trim().split(' ')[0] as string);
    if (startMs === undefined) continue;
    const raw = rows.slice(arrowAt + 1).join(' ');
    // VTT voice span: `<v Bob>` or `<v.loud Bob>` names the speaker.
    const voice = kind === 'vtt' ? /<v(?:\.[^\s>]*)?\s+([^>]+)>/.exec(raw) : null;
    const bodyText = decodeEntities(raw.replace(/<[^>]+>/g, '')).trim();
    if (!bodyText) continue;
    const vttSpeaker = voice ? decodeEntities(voice[1]!).trim() : '';
    const speakerMatch = kind === 'srt' ? /^([^:]{1,40}):\s+(.*)$/.exec(bodyText) : null;
    lines.push({
      startMs,
      ...(endMs !== undefined ? { endMs } : {}),
      ...(vttSpeaker ? { speaker: vttSpeaker, text: bodyText }
        : speakerMatch ? { speaker: speakerMatch[1]!.trim(), text: speakerMatch[2]! } : { text: bodyText }),
    });
  }
  return sortLines(lines);
}

export function parseSrt(body: string): TranscriptLine[] {
  return parseCueBlocks(body, 'srt');
}

export function parseVtt(body: string): TranscriptLine[] {
  return parseCueBlocks(body, 'vtt');
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
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map(decodeEntities).join('\n')
    .trim();
}

/**
 * Index of the line containing `positionMs` (or the last one started before it).
 * M23 US11: a binary search over lines sorted by start (the parsers sort them), so a
 * three-hour transcript costs ~12 steps per tick instead of a walk from the top.
 */
export function currentLine(lines: readonly TranscriptLine[], positionMs: number): number | undefined {
  let lo = 0;
  let hi = lines.length - 1;
  let found: number | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (lines[mid]!.startMs <= positionMs) { found = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return found;
}
