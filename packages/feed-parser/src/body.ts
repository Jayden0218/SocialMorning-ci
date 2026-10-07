// Reads a feed response with a 5 MB cap and decodes it in the feed's own character set.
/**
 * M23 US5 (FR-009), shared by the server (`apps/api/src/catalog/feed.ts`) and the phone
 * (`apps/mobile/src/feeds/fetch.ts`) so both refuse the same feeds and read the same text.
 *
 * No host APIs here (the package rule): the response is duck-typed, and the text decoder is
 * passed in. That matters on the phone — Expo's native `TextDecoder` knows UTF-8 only
 * (`node_modules/expo/src/winter/TextDecoder.ts` throws RangeError for any other label), so
 * there GBK and Big5 fall back to UTF-8, and Latin-1 / Windows-1252 is decoded by hand below.
 * On the server (Node, full ICU) every label works.
 */

/**
 * A feed bigger than this is refused (spec US5 scenario 2). 20 MB, not the first 5: on 2026-10-08 a real
 * subscribed feed (feeds.megaphone.fm/GLT1412515089) was 5.3 MB and the iPhone refused it.
 */
export const FEED_MAX_BYTES = 20 * 1024 * 1024;
/** A feed that has not answered in this long is given up (spec US5 scenario 1). */
export const FEED_TIMEOUT_MS = 8_000;

export class FeedTooLargeError extends Error {
  constructor(bytes: number, cap: number) {
    super(`feed is over ${cap} bytes (${bytes})`);
    this.name = 'FeedTooLargeError';
  }
}

type Reader = { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(reason?: unknown): Promise<void> };
/** The parts of a fetch `Response` this reads; a test double needs only `text()`. */
export type BodySource = {
  headers?: { get(name: string): string | null } | undefined;
  body?: { getReader(): Reader } | null | undefined;
  arrayBuffer?: (() => Promise<ArrayBuffer>) | undefined;
  text(): Promise<string>;
};

/** `stream: false` never touches `res.body` (the phone: see `streamReader`). */
export type ReadOptions = { stream?: boolean };

/**
 * A reader for the body stream, or undefined when there is none to use. Defect 4 (owner's
 * iPhone, 2026-10-07): right after M23 every phone feed refresh failed ("5 shows could not
 * refresh"). React Native's own fetch has no `response.body` at all, and Expo's replacement
 * builds its stream lazily in JS — so the phone does not stream (`stream: false`), and here a
 * missing body, a body with no `getReader`, or a getter/getReader that throws all mean
 * "read the whole body instead", never an error.
 */
function streamReader(res: BodySource, opts: ReadOptions): Reader | undefined {
  if (opts.stream === false) return undefined;
  try {
    const body = res.body;
    return body && typeof body.getReader === 'function' ? body.getReader() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The body as bytes (streamed where allowed, stopping at the cap; else read whole, then checked)
 * — or as text when the response can give nothing else (an old test double). The declared
 * Content-Length is checked first either way. Throws `FeedTooLargeError` past `cap`.
 */
export async function readCapped(res: BodySource, cap = FEED_MAX_BYTES, opts: ReadOptions = {}): Promise<{ bytes: Uint8Array } | { text: string }> {
  const declared = Number(res.headers?.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > cap) throw new FeedTooLargeError(declared, cap);

  const reader = streamReader(res, opts);
  if (reader) {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > cap) {
        // Stop downloading the rest: a 2 GB "feed" must cost 5 MB, not 2 GB.
        try { await reader.cancel(); } catch { /* already closed */ }
        throw new FeedTooLargeError(total, cap);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
    return { bytes };
  }
  if (typeof res.arrayBuffer === 'function') {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > cap) throw new FeedTooLargeError(buf.byteLength, cap);
    return { bytes: new Uint8Array(buf) };
  }
  const text = await res.text();
  // One UTF-16 unit is at least one byte, so this never refuses a feed under the cap.
  if (text.length > cap) throw new FeedTooLargeError(text.length, cap);
  return { text };
}

/** What a byte-order mark, the Content-Type header and the `<?xml encoding=…?>` declaration say. */
export type CharsetHints = { bom?: string; header?: string; xml?: string };

/** WHATWG-style label folding for the charsets podcast feeds actually use. */
export function normaliseCharset(label: string): string {
  const l = label.trim().toLowerCase().replace(/^["']|["']$/g, '');
  if (l === 'utf8' || l === 'utf-8' || l === 'unicode-1-1-utf-8') return 'utf-8';
  if (l === 'gb2312' || l === 'gb_2312-80' || l === 'gbk' || l === 'x-gbk' || l === 'cp936' || l === 'chinese' || l === 'csgb2312') return 'gbk';
  if (l === 'gb18030') return 'gb18030';
  if (l === 'big5' || l === 'big5-hkscs' || l === 'x-x-big5' || l === 'cn-big5' || l === 'csbig5') return 'big5';
  // The Encoding Standard reads every Latin-1 label as windows-1252 (a superset for text).
  if (l === 'iso-8859-1' || l === 'iso8859-1' || l === 'latin1' || l === 'l1' || l === 'us-ascii' || l === 'ascii' || l === 'cp1252' || l === 'windows-1252' || l === 'cp819') return 'windows-1252';
  return l;
}

export function charsetHints(contentType: string | null | undefined, bytes: Uint8Array): CharsetHints {
  const hints: CharsetHints = {};
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) hints.bom = 'utf-8';
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) hints.bom = 'utf-16be';
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) hints.bom = 'utf-16le';
  const header = /charset\s*=\s*"?([^";\s]+)/i.exec(contentType ?? '');
  if (header) hints.header = normaliseCharset(header[1]!);
  // The declaration is ASCII in every charset a feed uses, so read the head byte by byte.
  let head = '';
  for (let i = 0; i < Math.min(bytes.length, 512); i++) head += String.fromCharCode(bytes[i]!);
  const xml = /^(?:﻿|ï»¿)?\s*<\?xml[^>]*?\bencoding\s*=\s*["']([A-Za-z0-9._:-]+)["']/.exec(head);
  if (xml) hints.xml = normaliseCharset(xml[1]!);
  return hints;
}

// Windows-1252 0x80–0x9F (the only part that differs from Latin-1); 0 = unassigned → U+FFFD.
const CP1252_HIGH = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0,
  0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178,
];

/** Latin-1 / Windows-1252 by hand, for runtimes whose decoder knows UTF-8 only. */
export function decodeWindows1252(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 4096) {
    const part: number[] = [];
    const end = Math.min(i + 4096, bytes.length);
    for (let j = i; j < end; j++) {
      const b = bytes[j]!;
      part.push(b >= 0x80 && b <= 0x9f ? (CP1252_HIGH[b - 0x80] || 0xfffd) : b);
    }
    out += String.fromCharCode(...part);
  }
  return out;
}

/** Builds a decoder for a label, or throws (RangeError) when the runtime does not know it. */
export type MakeDecoder = (label: string, fatal: boolean) => { decode(bytes: Uint8Array): string };

/**
 * Bytes → text in the feed's charset. Order: a BOM; then the header and the XML declaration
 * (a header saying UTF-8 over bytes that are not UTF-8 yields to the declaration — a common
 * misconfigured server); then UTF-8 with replacement characters. A label the runtime cannot
 * decode is skipped, so the worst case is the old behaviour (UTF-8), never a failure.
 */
export function decodeFeedBytes(bytes: Uint8Array, contentType: string | null | undefined, make: MakeDecoder): string {
  const hints = charsetHints(contentType, bytes);
  const attempt = (label: string, fatal: boolean): string | undefined => {
    try { return make(label, fatal).decode(bytes); }
    catch { return label === 'windows-1252' ? decodeWindows1252(bytes) : undefined; }
  };
  if (hints.bom) {
    const t = attempt(hints.bom, false);
    if (t !== undefined) return t;
  }
  const candidates = [hints.header, hints.xml].filter((l, i, all): l is string => l !== undefined && all.indexOf(l) === i);
  for (let i = 0; i < candidates.length; i++) {
    const label = candidates[i]!;
    // UTF-8 is checked strictly while another candidate remains, so a wrong header can be overruled.
    const t = attempt(label, label === 'utf-8' && i < candidates.length - 1);
    if (t !== undefined) return t;
  }
  return attempt('utf-8', false) ?? decodeWindows1252(bytes);
}

/** `readCapped` then `decodeFeedBytes`: the one call both apps make. */
export async function readFeedText(res: BodySource, make: MakeDecoder, cap = FEED_MAX_BYTES, opts: ReadOptions = {}): Promise<string> {
  const body = await readCapped(res, cap, opts);
  if ('text' in body) return body.text;
  return decodeFeedBytes(body.bytes, res.headers?.get('content-type'), make);
}
