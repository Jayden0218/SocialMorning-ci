// Turns numbers into text: times like 14:32, dates, show notes as plain text.
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
 * Shownotes arrive as HTML; the app shows text. Entities are decoded so a listener does not
 * read "Tom &amp; Jerry".
 *
 * M12 FR-003 (B4, found on the iPhone 2026-09-29): only `<br>` and `</p>` used to break a
 * line, so "…/button</a></div><div>There" read "buttonThere", and two links side by side read
 * "MuseumThe Button". Every block tag now breaks the line, two adjacent links are put on
 * separate lines, and a run of blank or space-only lines collapses to one paragraph gap.
 */
export function htmlToText(html: string | undefined): string {
  if (html === undefined) return '';
  return tidy(
    html
      .replace(/<\/a>\s*<a\b/gi, '</a>\n<a')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(?:p|div|h[1-6]|ul|ol|table|tr|blockquote|section|article|header|footer)\b[^>]*>/gi, '\n\n')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(/<\/li>/gi, '')
      .replace(/<[^>]+>/g, ''),
  );
}

/** Entities decoded, lines trimmed at the end, blank runs collapsed to one gap. */
function tidy(text: string): string {
  return decode(text)
    .replace(/[ \t\u00a0]+\n/g, '\n')
    .replace(/\n[ \t\u00a0]*(?=\n)/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decode(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
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

/** A run of shownotes text: plain, a timestamp that seeks (`atMs`), a link (`href`), or (M22 US7) a picture (`image`, its http(s) address; `text` is its alt). */
export type NotePart = { text: string; atMs?: number; href?: string; image?: string };

const TIME = /^([ \t]*(?:[-•*·–]|\(|\[)?[ \t]*)((?:\d{1,2}:)?\d{1,2}:[0-5]\d)(?![\d:])/;
/** Mid-line: only h:mm:ss (two colons), never preceded or followed by another digit or colon. */
const HMS = /(?<![\d:])(\d{1,2}:[0-5]\d:[0-5]\d)(?![\d:])/g;

/**
 * Shownotes split around their chapter times ("00:39", "1:02:03"), so each one can be a link
 * that plays from there. M12 FR-030: only a time that opens a line (after an optional bullet or
 * bracket) counts — "John 3:16" mid-sentence stays text — and, when the length is known, only
 * one inside the episode. Phone check 2026-10-02: a full h:mm:ss time (two colons) also counts
 * mid-line — shows write ranges inside sentences ("(00:32:21-01:09:30)"), and no verse or clock
 * time has two colons.
 */
export function timestampParts(text: string, maxMs?: number): NotePart[] {
  const parts: NotePart[] = [];
  const push = (p: NotePart) => {
    const prev = parts[parts.length - 1];
    if (p.atMs === undefined && prev && prev.atMs === undefined && prev.href === undefined) prev.text += p.text;
    else if (p.text !== '') parts.push(p);
  };
  const lines = text.split('\n');
  lines.forEach((line, n) => {
    const m = TIME.exec(line);
    const atMs = m ? m[2]!.split(':').reduce((sum, v) => sum * 60 + Number(v), 0) * 1000 : undefined;
    let rest = line;
    if (m && atMs !== undefined && (maxMs === undefined || atMs <= maxMs)) {
      push({ text: m[1]! });
      push({ text: m[2]!, atMs });
      rest = line.slice(m[0].length);
    }
    let last = 0;
    for (const t of rest.matchAll(HMS)) {
      const ms = t[1]!.split(':').reduce((sum, v) => sum * 60 + Number(v), 0) * 1000;
      if (maxMs !== undefined && ms > maxMs) continue;
      push({ text: rest.slice(last, t.index) });
      push({ text: t[1]!, atMs: ms });
      last = t.index! + t[0].length;
    }
    push({ text: rest.slice(last) });
    if (n < lines.length - 1) push({ text: '\n' });
  });
  return parts;
}

const URL = /https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/g;

const IMG = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
const ALT = /\balt\s*=\s*["']([^"']*)["']/i;

/** M22 US7: each `<img src>` with an http(s) address as a marker on its own line; any other image is dropped. */
function markImages(html: string): string {
  return html.replace(IMG, (tag: string, src: string) => {
    const url = decode(src.trim());
    if (!/^https?:\/\/[^\s"'<>]+$/i.test(url)) return '';
    const alt = decode(ALT.exec(tag)?.[1] ?? '').replace(/[\u0001-\u0006]/g, '');
    return `\n\u0004${url}\u0005${alt}\u0006\n`;
  });
}

/**
 * M12 FR-003, FR-030, FR-031: shownotes as runs — plain text, links (from `<a href>` and from
 * bare URLs) and chapter times — for the episode page to render as nested Text.
 *
 * M22 US7 (FR-023, research R6): an `<img>` with an http(s) `src` becomes an `image` part, in
 * place, shown from the publisher's address (never copied). An image inside a link is kept as
 * a picture after the link's words.
 */
export function noteParts(html: string | undefined, maxMs?: number): NotePart[] {
  if (html === undefined) return [];
  // Mark each <a href> so its target survives the tag stripping.
  const marked = markImages(html.replace(/<\/a>\s*<a\b/gi, '</a>\n<a').replace(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
    const pics = [...label.matchAll(IMG)].map((m) => m[0]).join('');
    const words = label.replace(/<[^>]+>/g, '');
    // A link that only wraps a picture is shown as the picture alone.
    if (pics !== '' && words.trim() === '') return pics;
    return `\u0001${href}\u0002${words}\u0003${pics}`;
  }));
  const text = htmlToText(marked);
  const out: NotePart[] = [];
  const plain = (t: string) => {
    let last = 0;
    for (const m of t.matchAll(URL)) {
      if (m.index! > last) out.push(...timestampParts(t.slice(last, m.index), maxMs));
      out.push({ text: m[0], href: m[0] });
      last = m.index! + m[0].length;
    }
    if (last < t.length) out.push(...timestampParts(t.slice(last), maxMs));
  };
  let at = 0;
  for (const m of text.matchAll(/\u0001([^\u0002]*)\u0002([^\u0003]*)\u0003|\u0004([^\u0005]*)\u0005([^\u0006]*)\u0006/g)) {
    plain(text.slice(at, m.index));
    if (m[3] !== undefined) {
      out.push({ text: m[4] ?? '', image: m[3] });
    } else {
      const label = m[2]!.trim() || m[1]!;
      out.push({ text: label, href: decode(m[1]!) });
    }
    at = m.index! + m[0].length;
  }
  plain(text.slice(at));
  return out.filter((p) => p.text !== '' || p.image !== undefined);
}

const summaries = new Map<string, string>();

/**
 * M12 T036: a row's one-line summary of its shownotes, cached — the show page used to strip
 * every row's HTML again on every render, for 861 rows on one show.
 */
export function noteSummary(html: string | undefined): string {
  if (html === undefined) return '';
  const hit = summaries.get(html);
  if (hit !== undefined) return hit;
  const line = htmlToText(html).replace(/\s+/g, ' ').slice(0, 280);
  if (summaries.size >= 1000) summaries.delete(summaries.keys().next().value!);
  summaries.set(html, line);
  return line;
}
