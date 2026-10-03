// Measures audio length from MP4 or AAC file bytes.
/**
 * M12 FR-104 — "≤ 60 s, declared AND checked". The phone declares the length in a header;
 * the server measures it from the bytes and refuses a file it cannot measure. Two shapes,
 * the two the recorder can produce:
 *   - MP4/M4A: the `mvhd` box inside `moov` holds timescale + duration (ISO/IEC 14496-12 §8.2.2).
 *   - raw AAC (ADTS): every frame header gives its sample rate and 1024 samples per raw block
 *     (ISO/IEC 13818-7 §6.2); the length is the sum, after an optional leading ID3 tag.
 */
export function audioDurationMs(b: Uint8Array): number | undefined {
  return mp4Duration(b) ?? adtsDuration(b);
}

const u32 = (b: Uint8Array, o: number) => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
const type = (b: Uint8Array, o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);

function findBox(b: Uint8Array, start: number, end: number, want: string): { body: number; end: number } | undefined {
  let o = start;
  while (o + 8 <= end) {
    let size = u32(b, o);
    let header = 8;
    if (size === 1) {
      if (o + 16 > end) return undefined;
      size = u32(b, o + 8) * 2 ** 32 + u32(b, o + 12);
      header = 16;
    } else if (size === 0) {
      size = end - o;
    }
    if (size < header || o + size > end) return undefined;
    if (type(b, o + 4) === want) return { body: o + header, end: o + size };
    o += size;
  }
  return undefined;
}

function mp4Duration(b: Uint8Array): number | undefined {
  if (b.length < 16 || type(b, 4) !== 'ftyp') return undefined;
  const moov = findBox(b, 0, b.length, 'moov');
  if (!moov) return undefined;
  const mvhd = findBox(b, moov.body, moov.end, 'mvhd');
  if (!mvhd) return undefined;
  const v = b[mvhd.body]!;
  const need = v === 1 ? 32 : 20;
  if (mvhd.body + need > mvhd.end) return undefined;
  const timescale = v === 1 ? u32(b, mvhd.body + 20) : u32(b, mvhd.body + 12);
  const duration = v === 1 ? u32(b, mvhd.body + 24) * 2 ** 32 + u32(b, mvhd.body + 28) : u32(b, mvhd.body + 16);
  if (timescale === 0) return undefined;
  return Math.round((duration * 1000) / timescale);
}

const ADTS_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

function adtsDuration(b: Uint8Array): number | undefined {
  let o = 0;
  // An ID3v2 tag may come first: "ID3", version (2), flags (1), a 4-byte syncsafe size.
  if (b.length >= 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    o = 10 + ((b[6]! & 0x7f) << 21) + ((b[7]! & 0x7f) << 14) + ((b[8]! & 0x7f) << 7) + (b[9]! & 0x7f);
  }
  let seconds = 0;
  let frames = 0;
  while (o + 7 <= b.length) {
    if (b[o] !== 0xff || (b[o + 1]! & 0xf6) !== 0xf0) return undefined; // sync word + layer 00
    const rate = ADTS_RATES[(b[o + 2]! >> 2) & 0x0f];
    const len = ((b[o + 3]! & 0x03) << 11) | (b[o + 4]! << 3) | (b[o + 5]! >> 5);
    if (rate === undefined || len < 7) return undefined;
    seconds += (1024 * ((b[o + 6]! & 0x03) + 1)) / rate;
    frames++;
    o += len;
  }
  return frames > 0 ? Math.round(seconds * 1000) : undefined;
}
