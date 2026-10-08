// Tests that uploaded pictures lose EXIF GPS, XMP, IPTC and text metadata but keep the picture (guard G-SB3).
/**
 * M25 lane SB — guard G-SB3 (the JPEG with GPS below). The break that turns it red: in
 * `src/image-meta.ts` make `jpegDrops` return false for 0xe1 (APP1 is then kept, GPS and all).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageFormat, imageMetadata, orientationSegment, readExif, stripImageMetadata } from '../src/image-meta.ts';

const u8 = (...parts: (number[] | Uint8Array)[]) => new Uint8Array(parts.flatMap((p) => [...p]));
const str = (s: string) => [...s].map((ch) => ch.charCodeAt(0));
const seg = (marker: number, data: number[]) => [0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 0xff, ...data];
const EXIF = str('Exif\0\0');

/** A TIFF block with IFD0 holding these (tag, SHORT value) entries. */
function tiff(le: boolean, entries: [number, number][]): number[] {
  const w16 = (v: number) => (le ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
  const w32 = (v: number) => (le ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
  return [...(le ? str('II') : str('MM')), ...w16(42), ...w32(8), ...w16(entries.length),
    ...entries.flatMap(([tag, v]) => [...w16(tag), ...w16(3), ...w32(1), ...w16(v), 0, 0]), ...w32(0)];
}
const SCAN = [0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0x00, 0x22, 0xff, 0xd9];
const has = (hay: Uint8Array, needle: number[]) => hay.some((_, i) => needle.every((v, k) => hay[i + k] === v));

test('formats by their first bytes', () => {
  assert.equal(imageFormat(u8([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
  assert.equal(imageFormat(u8([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
  assert.equal(imageFormat(u8(str('RIFF'), [4, 0, 0, 0], str('WEBP'))), 'webp');
  assert.equal(imageFormat(u8(str('RIFF'), [4, 0, 0, 0], str('WAVE'))), undefined);
  assert.equal(imageFormat(u8(str('RIFX'), [4, 0, 0, 0], str('WEBP'))), undefined);
  assert.equal(imageFormat(u8(str('RIFF'))), undefined);
  assert.equal(stripImageMetadata(u8(str('hello'))), undefined);
  assert.deepEqual(imageMetadata(u8(str('hello'))), ['unreadable']);
});

test('readExif: both byte orders, Orientation, and refusals', () => {
  assert.deepEqual(readExif(u8(tiff(true, [[0x0112, 6], [0x8825, 99]]))), { tags: [0x0112, 0x8825], orientation: 6 });
  assert.deepEqual(readExif(u8(tiff(false, [[0x010f, 1]]))), { tags: [0x010f] });
  assert.equal(readExif(u8([1, 2, 3])), undefined, 'too short');
  assert.equal(readExif(u8(str('XX'), [0, 42, 0, 0, 0, 8])), undefined, 'no byte order');
  assert.equal(readExif(u8(str('MM'), [0, 42, 0, 0, 0, 200])), undefined, 'IFD0 past the end');
  assert.equal(readExif(u8(str('MM'), [0, 42, 0, 0, 0, 8, 0, 9])), undefined, 'more entries than bytes');
  assert.equal(orientationSegment(6).length, 36);
  assert.deepEqual(readExif(orientationSegment(6).subarray(10)), { tags: [0x0112], orientation: 6 });
});

test('G-SB3: a JPEG with GPS comes out without it — and without XMP, IPTC, comments, maker data or a trailer — and keeps the picture', () => {
  const app0 = seg(0xe0, [...str('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const gps = seg(0xe1, [...EXIF, ...tiff(true, [[0x010f, 7], [0x0112, 6], [0x8825, 26]])]);
  const xmp = seg(0xe1, str('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>'));
  const icc = seg(0xe2, str('ICC_PROFILE\0abc'));
  const maker = seg(0xe5, [1, 2, 3]);
  const iptc = seg(0xed, str('Photoshop 3.0\0'));
  const adobe = seg(0xee, str('Adobe'));
  const app15 = seg(0xef, [9]);
  const com = seg(0xfe, str('shot at home'));
  const dqt = seg(0xdb, [0, 1, 2]);
  const sof = seg(0xc0, [8, 0, 1, 0, 1, 1]);
  const input = u8([0xff, 0xd8], app0, gps, xmp, icc, maker, iptc, adobe, app15, com, [0xff, 0xff], dqt, [0xff, 0x01], [0xff, 0xd3], sof, SCAN, str('MotionPhoto trailer'));
  assert.deepEqual(imageMetadata(input).sort(), ['app', 'comment', 'exif', 'gps', 'iptc', 'xmp']);
  const out = stripImageMetadata(input)!;
  assert.deepEqual(imageMetadata(out), [], 'no personal metadata is left');
  assert.ok(!has(out, [0x25, 0x88]) && !has(out, str('shot at home')) && !has(out, str('Photoshop')), 'not a byte of it');
  assert.deepEqual([...out.subarray(0, 2)], [0xff, 0xd8]);
  assert.deepEqual([...out.subarray(2, 38)], [...orientationSegment(6)], 'the turn is kept, right after SOI');
  for (const kept of [app0, icc, adobe, dqt, sof, [0xff, 0x01], [0xff, 0xd3], SCAN]) assert.ok(has(out, kept), 'the picture segments stay');
  assert.deepEqual([...out.subarray(out.length - 2)], [0xff, 0xd9], 'the trailer after the last end-of-image is cut');
});

test('JPEG: no turn kept for Orientation 1 or 9, an XMP-only APP1, or an Exif that cannot be read', () => {
  for (const o of [1, 9]) {
    const out = stripImageMetadata(u8([0xff, 0xd8], seg(0xe1, [...EXIF, ...tiff(false, [[0x0112, o]])]), SCAN))!;
    assert.deepEqual([...out], [0xff, 0xd8, ...SCAN]);
  }
  // Orientation alone is not personal: listed as nothing.
  assert.deepEqual(imageMetadata(u8([0xff, 0xd8], seg(0xe1, [...EXIF, ...tiff(false, [[0x0112, 3]])]), SCAN)), []);
  assert.deepEqual([...stripImageMetadata(u8([0xff, 0xd8], seg(0xe1, str('xmp')), SCAN))!], [0xff, 0xd8, ...SCAN]);
  const bad = u8([0xff, 0xd8], seg(0xe1, [...EXIF, 1, 2]), SCAN);
  assert.deepEqual(imageMetadata(bad), ['exif']);
  assert.deepEqual([...stripImageMetadata(bad)!], [0xff, 0xd8, ...SCAN]);
});

test('JPEG: a scan with no end marker keeps all its data; an image that is only SOI + EOI is unchanged', () => {
  const noEnd = u8([0xff, 0xd8], [0xff, 0xda, 0, 2, 5, 6, 7]);
  assert.deepEqual([...stripImageMetadata(noEnd)!], [...noEnd]);
  assert.deepEqual([...stripImageMetadata(u8([0xff, 0xd8, 0xff, 0xd9]))!], [0xff, 0xd8, 0xff, 0xd9]);
});

test('JPEG that stops walking: kept as it is from that point, read as unreadable; GPS before the break still goes', () => {
  const broken = [
    u8([0xff, 0xd8], seg(0xe0, [0, 0])), // ends before any scan
    u8([0xff, 0xd8], seg(0xe0, [0, 0]), [0x12, 0x34]), // not a marker
    u8([0xff, 0xd8, 0xff, 0xff, 0xff]), // fill bytes to the end
    u8([0xff, 0xd8, 0xff, 0xe0, 0x00]), // no room for a length
    u8([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0, 0]), // a length under 2
    u8([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x40, 0, 0]), // a length past the end
  ];
  for (const b of broken) {
    assert.deepEqual([...stripImageMetadata(b)!], [...b]);
    assert.deepEqual(imageMetadata(b), ['unreadable']);
  }
  // A cut-off camera photo: the Exif with GPS sits at the front and is removed all the same.
  const cut = u8([0xff, 0xd8], seg(0xe1, [...EXIF, ...tiff(false, [[0x8825, 26]])]), [0xff, 0xe0, 0x00, 0x40, 1, 2]);
  assert.deepEqual(imageMetadata(cut).sort(), ['exif', 'gps', 'unreadable']);
  const out = stripImageMetadata(cut)!;
  assert.deepEqual([...out], [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x40, 1, 2]);
  assert.deepEqual(imageMetadata(out), ['unreadable']);
});

const crc = [0, 0, 0, 0];
const chunk = (type: string, data: number[]) => [(data.length >>> 24) & 0xff, (data.length >> 16) & 0xff, (data.length >> 8) & 0xff, data.length & 0xff, ...str(type), ...data, ...crc];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test('PNG: eXIf, text and time chunks go; the image chunks stay; a broken file keeps its tail', () => {
  const ihdr = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  const idat = chunk('IDAT', [1, 2, 3]);
  const iend = chunk('IEND', []);
  const input = u8(PNG, ihdr, chunk('tEXt', str('GPS\0here')), chunk('eXIf', tiff(false, [[0x8825, 1]])), chunk('tIME', [7, 0xea, 1, 1, 0, 0, 0]), chunk('iTXt', [1]), chunk('zTXt', [2]), idat, iend);
  assert.deepEqual(imageMetadata(input).sort(), ['exif', 'text', 'time']);
  const out = stripImageMetadata(input)!;
  assert.deepEqual([...out], [...u8(PNG, ihdr, idat, iend)]);
  assert.deepEqual(imageMetadata(out), []);
  for (const b of [u8(PNG, ihdr), u8(PNG, [0, 0, 1, 0], str('IDAT'), [1, 2, 3, 4, 5, 6, 7, 8])]) {
    assert.deepEqual([...stripImageMetadata(b)!], [...b]);
    assert.deepEqual(imageMetadata(b), ['unreadable']);
  }
  const cut = u8(PNG, ihdr, chunk('tEXt', [1]), [0, 0]);
  assert.deepEqual([...stripImageMetadata(cut)!], [...u8(PNG, ihdr, [0, 0])]);
  // Anything after IEND is not kept.
  assert.deepEqual([...stripImageMetadata(u8(PNG, ihdr, iend, [7, 7]))!], [...u8(PNG, ihdr, iend)]);
});

const riff = (body: number[]) => { const n = body.length + 4; return u8(str('RIFF'), [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24], str('WEBP'), body); };
const wchunk = (type: string, data: number[]) => [...str(type), data.length & 0xff, (data.length >> 8) & 0xff, 0, 0, ...data, ...(data.length & 1 ? [0] : [])];

test('WebP: EXIF and XMP chunks go, their VP8X flags are cleared, the RIFF size is right; a broken file keeps its tail', () => {
  const vp8x = wchunk('VP8X', [0x0c | 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const vp8 = wchunk('VP8 ', [1, 2, 3]); // odd: one pad byte
  const input = riff([...vp8x, ...vp8, ...wchunk('EXIF', tiff(true, [[0x8825, 1]])), ...wchunk('XMP ', str('<x/>'))]);
  assert.deepEqual(imageMetadata(input).sort(), ['exif', 'xmp']);
  const out = stripImageMetadata(input)!;
  const want = riff([...wchunk('VP8X', [0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0]), ...vp8]);
  assert.deepEqual([...out], [...want]);
  assert.deepEqual(imageMetadata(out), []);
  // A last chunk with an odd size and no pad byte still walks; an empty VP8X is copied as it is.
  const unpadded = riff([...wchunk('VP8X', []), ...str('VP8 '), 1, 0, 0, 0, 9]);
  assert.deepEqual([...stripImageMetadata(unpadded)!], [...unpadded]);
  for (const b of [riff([]), riff([...vp8, 1, 2, 3]), riff([...str('VP8 '), 50, 0, 0, 0, 1])]) {
    assert.deepEqual([...stripImageMetadata(b)!], [...b]);
    assert.deepEqual(imageMetadata(b), ['unreadable']);
  }
  const cut = riff([...wchunk('EXIF', [1, 2]), ...vp8, 9]);
  assert.deepEqual(imageMetadata(cut).sort(), ['exif', 'unreadable']);
  assert.deepEqual([...stripImageMetadata(cut)!], [...riff([...vp8, 9])]);
});
