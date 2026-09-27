/** Display helpers. No product decisions live here. */

/** `mm:ss`, or `h:mm:ss` once an episode passes an hour. */
export function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** A date a listener recognises, or nothing if the feed gave us none. */
export function shortDate(ms: number | undefined): string {
  if (ms === undefined) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Shownotes arrive as HTML and M1 renders plain text (chapters and rich
 * shownotes are M2). Entities are decoded so a listener does not read
 * "Tom &amp; Jerry".
 */
export function htmlToText(html: string | undefined): string {
  if (html === undefined) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * "3 min ago", computed from the SERVER clock (spec edge case "clock skew"):
 * two phones must agree, and a phone's clock may be wrong. Never negative.
 */
export function relativeTime(createdAt: string, serverTime: string): string {
  const s = Math.max(0, Math.round((new Date(serverTime).getTime() - new Date(createdAt).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}

/** "69 min" — how the reference writes an episode's length. Empty when the feed gave none. */
export function minutesLabel(ms: number | undefined): string {
  if (ms === undefined) return '';
  return `${Math.max(1, Math.round(ms / 60_000))} min`;
}

/** "13 h ago" for this week, the date after that. Uses the phone's clock: a feed date, not a comment. */
export function ago(ms: number | undefined, now: number): string {
  if (ms === undefined) return '';
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} d ago`;
  return shortDate(ms);
}

/** A run of shownotes text, or a timestamp in it that seeks (`atMs`). */
export type NotePart = { text: string; atMs?: number };

/**
 * Shownotes split around their timestamps ("00:39", "1:02:03"), so each one can be a
 * link that plays from there. A time glued to other digits or colons is left as text.
 */
export function timestampParts(text: string): NotePart[] {
  const parts: NotePart[] = [];
  const re = /(^|[^\d:])((?:\d{1,2}:)?\d{1,2}:[0-5]\d)(?![\d:])/g;
  let last = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const start = m.index + m[1]!.length;
    if (start > last) parts.push({ text: text.slice(last, start) });
    const atMs = m[2]!.split(':').reduce((sum, n) => sum * 60 + Number(n), 0) * 1000;
    parts.push({ text: m[2]!, atMs });
    last = start + m[2]!.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
