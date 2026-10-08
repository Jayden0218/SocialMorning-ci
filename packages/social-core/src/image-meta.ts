// Removes personal metadata (EXIF with GPS, XMP, IPTC, comments, text) from JPEG, PNG and WebP bytes, keeping the picture.
/**
 * M25 lane SB (audit #36). A photo from a phone can carry where it was taken (EXIF GPS), when, on
 * which device, and editor notes. The server stores uploads byte for byte, so it strips them first
 * (avatars, comment pictures, status photos, feedback); the Studio does the same in the browser
 * before a cover or launch image goes to storage. Pure bytes in, bytes out — no image decoding,
 * no dependency, so it runs on the phone, the server and the browser alike.
 *
 *  - JPEG: APP1 (Exif, XMP), APP3–APP13 and APP15 (IPTC, maker data), and COM segments go. APP0
 *    (JFIF), APP2 (ICC colour profile) and APP14 (Adobe colour transform) stay. If the old Exif
 *    turned the picture (Orientation 2–8), a 36-byte Exif segment holding ONLY that is put back
 *    right after SOI, so it is not drawn sideways. Anything after the last end-of-image marker
 *    (phone "motion photo" or vendor trailers) is cut.
 *  - PNG: eXIf, tEXt, zTXt, iTXt and tIME chunks go.
 *  - WebP: EXIF and XMP chunks go, and VP8X's two flags for them are cleared.
 * A file that stops walking part-way (truncated, or not really what its first bytes say) loses the
 * metadata found before that point and keeps the rest as it is; `imageMetadata` then also says
 * 'unreadable'. Metadata sits at the front of real files, so a cut-off photo still loses its GPS.
 * Only bytes that are not a JPEG, PNG or WebP at all answer `undefined`.
 */

const be16 = (b: Uint8Array, o: number): number => ((b[o]! << 8) | b[o + 1]!) >>> 0;
const be32 = (b: Uint8Array, o: number): number => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const le16 = (b: Uint8Array, o: number): number => (b[o]! | (b[o + 1]! << 8)) >>> 0;
const le32 = (b: Uint8Array, o: number): number => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
const ascii = (b: Uint8Array, o: number, n: number): string => String.fromCharCode(...b.subarray(o, o + n));
const starts = (b: Uint8Array, sig: readonly number[]): boolean => b.length >= sig.length && sig.every((v, i) => b[i] === v);

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export type ImageFormat = 'jpeg' | 'png' | 'webp';

/** The format by its first bytes; the name a sender gives is never trusted. */
export function imageFormat(b: Uint8Array): ImageFormat | undefined {
  if (starts(b, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (starts(b, PNG_SIGNATURE)) return 'png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  return undefined;
}

/** A walk: the blocks found, then what follows them (`rest`); `complete` false when the walk stopped on bad bytes. */
type Block = { tag: number | string; start: number; end: number };
type Walk = { blocks: Block[]; rest: Uint8Array; complete: boolean };

// ---------------------------------------------------------------- Exif (TIFF) inside JPEG APP1

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0]; // "Exif\0\0"
const TAG_ORIENTATION = 0x0112;
const TAG_GPS = 0x8825;

/** The tags of IFD0 and its Orientation value, or undefined when the TIFF block cannot be read. */
export function readExif(tiff: Uint8Array): { tags: number[]; orientation?: number } | undefined {
  if (tiff.length < 8) return undefined;
  const le = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!le && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return undefined;
  const r16 = le ? le16 : be16;
  const ifd = (le ? le32 : be32)(tiff, 4);
  if (ifd + 2 > tiff.length) return undefined;
  const n = r16(tiff, ifd);
  if (ifd + 2 + n * 12 > tiff.length) return undefined;
  const tags: number[] = [];
  let orientation: number | undefined;
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    const tag = r16(tiff, e);
    tags.push(tag);
    if (tag === TAG_ORIENTATION) orientation = r16(tiff, e + 8);
  }
  return orientation === undefined ? { tags } : { tags, orientation };
}

/** An APP1 segment holding only Orientation (big-endian TIFF, one IFD0 entry): 36 bytes. */
export function orientationSegment(orientation: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xe1, 0x00, 0x22, ...EXIF_HEADER,
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // "MM", 42, IFD0 at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, (orientation >> 8) & 0xff, orientation & 0xff, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
}

// ---------------------------------------------------------------- JPEG

/** SOI (callers have checked it), the marker segments up to the first scan, then the scan and what follows. */
function walkJpeg(b: Uint8Array): Walk {
  const blocks: Block[] = [];
  let pos = 2;
  const stop = (): Walk => ({ blocks, rest: b.subarray(pos), complete: false });
  for (;;) {
    if (pos >= b.length || b[pos] !== 0xff) return stop();
    let m = pos + 1;
    while (m < b.length && b[m] === 0xff) m++; // fill bytes
    if (m >= b.length) return stop();
    const marker = b[m]!;
    if (marker === 0xda || marker === 0xd9) {
      // The first scan (or an empty image): from here on it is picture data. Cut after the last EOI.
      let last = -1;
      for (let i = b.length - 2; i >= m - 1; i--) if (b[i] === 0xff && b[i + 1] === 0xd9) { last = i; break; }
      return { blocks, rest: b.subarray(m - 1, last < 0 ? b.length : last + 2), complete: true };
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { blocks.push({ tag: marker, start: m - 1, end: m + 1 }); pos = m + 1; continue; }
    if (m + 2 >= b.length) return stop();
    const end = m + 1 + be16(b, m + 1);
    if (end < m + 3 || end > b.length) return stop();
    blocks.push({ tag: marker, start: m - 1, end });
    pos = end;
  }
}

/** APP1 (Exif/XMP), APP3–APP13, APP15 and COM; APP0, APP2 (ICC) and APP14 (Adobe) stay. */
const jpegDrops = (marker: number): boolean => marker === 0xe1 || (marker >= 0xe3 && marker <= 0xed) || marker === 0xef || marker === 0xfe;

function jpegLabels(b: Uint8Array, s: Block): string[] {
  if (s.tag === 0xfe) return ['comment'];
  if (s.tag === 0xed) return ['iptc'];
  if (s.tag !== 0xe1) return ['app'];
  const data = b.subarray(s.start + 4, s.end);
  if (!starts(data, EXIF_HEADER)) return ['xmp'];
  const t = readExif(data.subarray(6));
  if (!t) return ['exif'];
  const labels: string[] = [];
  if (t.tags.some((x) => x !== TAG_ORIENTATION)) labels.push('exif');
  if (t.tags.includes(TAG_GPS)) labels.push('gps');
  return labels;
}

function stripJpeg(b: Uint8Array): Uint8Array {
  const w = walkJpeg(b);
  let orientation: number | undefined;
  const kept: Uint8Array[] = [b.subarray(0, 2)];
  for (const s of w.blocks) {
    if (s.tag === 0xe1) {
      const data = b.subarray(s.start + 4, s.end);
      const o = starts(data, EXIF_HEADER) ? readExif(data.subarray(6))?.orientation : undefined;
      if (o !== undefined && o >= 2 && o <= 8) orientation = o;
    }
    if (!jpegDrops(s.tag as number)) kept.push(b.subarray(s.start, s.end));
  }
  if (orientation !== undefined) kept.splice(1, 0, orientationSegment(orientation)); // right after SOI, where Exif belongs
  kept.push(w.rest);
  return concat(kept);
}

// ---------------------------------------------------------------- PNG

const PNG_DROPS: Record<string, string> = { eXIf: 'exif', tEXt: 'text', zTXt: 'text', iTXt: 'text', tIME: 'time' };

/** The signature (callers have checked it), then chunks up to IEND. */
function walkPng(b: Uint8Array): Walk {
  const blocks: Block[] = [];
  let pos = 8;
  while (pos + 12 <= b.length) {
    const end = pos + 12 + be32(b, pos);
    if (end > b.length) break;
    const tag = ascii(b, pos + 4, 4);
    blocks.push({ tag, start: pos, end });
    pos = end;
    if (tag === 'IEND') return { blocks, rest: b.subarray(pos, pos), complete: true };
  }
  return { blocks, rest: b.subarray(pos), complete: false };
}

// ---------------------------------------------------------------- WebP

const WEBP_DROPS: Record<string, string> = { EXIF: 'exif', 'XMP ': 'xmp' };

/** The RIFF/WEBP header (callers have checked it), then chunks to the end of the file. */
function walkWebp(b: Uint8Array): Walk {
  const blocks: Block[] = [];
  let pos = 12;
  while (pos + 8 <= b.length) {
    const size = le32(b, pos + 4);
    if (pos + 8 + size > b.length) break;
    const end = Math.min(pos + 8 + size + (size & 1), b.length);
    blocks.push({ tag: ascii(b, pos, 4), start: pos, end });
    pos = end;
  }
  return { blocks, rest: b.subarray(pos), complete: pos === b.length && blocks.length > 0 };
}

function stripWebp(b: Uint8Array): Uint8Array {
  const w = walkWebp(b);
  const kept: Uint8Array[] = [];
  for (const c of w.blocks) {
    if (WEBP_DROPS[c.tag]) continue;
    const bytes = b.slice(c.start, c.end);
    if (c.tag === 'VP8X' && bytes.length > 8) bytes[8] = bytes[8]! & ~0x0c; // the EXIF (0x08) and XMP (0x04) flags
    kept.push(bytes);
  }
  const body = concat([...kept, w.rest]);
  const size = body.length + 4;
  return concat([new Uint8Array([0x52, 0x49, 0x46, 0x46, size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >>> 24) & 0xff, 0x57, 0x45, 0x42, 0x50]), body]);
}

// ---------------------------------------------------------------- the two calls

/** The picture without personal metadata; undefined only when the bytes are not a JPEG, PNG or WebP. */
export function stripImageMetadata(b: Uint8Array): Uint8Array | undefined {
  switch (imageFormat(b)) {
    case 'jpeg': return stripJpeg(b);
    case 'png': {
      const w = walkPng(b);
      return concat([b.subarray(0, 8), ...w.blocks.filter((c) => !PNG_DROPS[c.tag]).map((c) => b.subarray(c.start, c.end)), w.rest]);
    }
    case 'webp': return stripWebp(b);
    default: return undefined;
  }
}

/**
 * The personal metadata the bytes carry, by kind ('exif', 'gps', 'xmp', 'iptc', 'comment', 'app',
 * 'text', 'time'); [] when clean. An Exif block with only Orientation is not personal and is not
 * listed. 'unreadable' when the walk stopped on bad bytes (or the format is not one of the three).
 */
export function imageMetadata(b: Uint8Array): string[] {
  const f = imageFormat(b);
  if (f === undefined) return ['unreadable'];
  const w = f === 'jpeg' ? walkJpeg(b) : f === 'png' ? walkPng(b) : walkWebp(b);
  const labels = f === 'jpeg'
    ? w.blocks.filter((s) => jpegDrops(s.tag as number)).flatMap((s) => jpegLabels(b, s))
    : w.blocks.map((c) => (f === 'png' ? PNG_DROPS : WEBP_DROPS)[c.tag]).filter((x): x is string => x !== undefined);
  return [...new Set([...labels, ...(w.complete ? [] : ['unreadable'])])];
}
