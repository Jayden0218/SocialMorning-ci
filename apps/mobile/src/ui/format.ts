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
