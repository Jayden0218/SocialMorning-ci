// Checks the app icon, Android adaptive icon and native splash are the Pulse mark and the dark page.
/**
 * M31 OQ1 (owner, 2026-10-28): the native splash is the Pulse ring on void, the app is dark only,
 * and the yellow microphone icon is gone. Native files cannot be seen without a build, so this
 * reads what the build will read: app.json, and the PNGs (header and pixels, decoded here).
 *
 * The break that turns it red: put the old yellow mark back in assets/icon.png, make the
 * foreground reach past the safe zone, or set userInterfaceStyle back to "light".
 * Pictures come from scripts/render-pulse-icon.mjs.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { inflateSync } from 'zlib';
import { colour } from '@/design/tokens';

const root = join(__dirname, '..');
const expo = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo;
const file = (p: string): string => join(root, p);

interface Png { width: number; height: number; colourType: number; rgba: Uint8Array }
/** Reads an 8-bit, non-interlaced RGB or RGBA PNG into RGBA bytes (all filters). */
function decode(p: string): Png {
  const b = readFileSync(file(p));
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  const width = b.readUInt32BE(16), height = b.readUInt32BE(20), depth = b[24], colourType = b[25] ?? 0;
  expect(depth).toBe(8);
  expect([2, 6]).toContain(colourType);
  const idat: Buffer[] = [];
  for (let o = 8; o < b.length;) {
    const len = b.readUInt32BE(o); const type = b.subarray(o + 4, o + 8).toString();
    if (type === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const bpp = colourType === 6 ? 4 : 3, stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)] ?? 0;
    const cur = new Uint8Array(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = (i >= bpp ? cur[i - bpp] : 0) ?? 0, up = prev[i] ?? 0, c = (i >= bpp ? prev[i - bpp] : 0) ?? 0;
      let add = 0;
      if (f === 1) add = a; else if (f === 2) add = up; else if (f === 3) add = (a + up) >> 1;
      else if (f === 4) { const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c); add = pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      cur[i] = ((cur[i] ?? 0) + add) & 255;
    }
    for (let x = 0; x < width; x++) {
      const d = (y * width + x) * 4;
      out[d] = cur[x * bpp] ?? 0; out[d + 1] = cur[x * bpp + 1] ?? 0; out[d + 2] = cur[x * bpp + 2] ?? 0;
      out[d + 3] = bpp === 4 ? (cur[x * bpp + 3] ?? 0) : 255;
    }
    prev = cur;
  }
  return { width, height, colourType, rgba: out };
}
/** Box round everything that is not fully transparent. */
function reach(p: Png): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = p.width, y0 = p.height, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    if (alphaAt(p, x, y) > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  return { x0, y0, x1, y1 };
}
const alphaAt = (p: Png, x: number, y: number): number => p.rgba[(y * p.width + x) * 4 + 3] ?? -1;
const corners = (n: number): [number, number][] => [[0, 0], [n, 0], [0, n], [n, n]];
const CORNERS_1024 = corners(1023);
const CORNERS_600 = corners(599);
const px = (p: Png, i: number): number => p.rgba[i] ?? -1;

describe('app.json points at the Pulse files', () => {
  it('the icon, the adaptive icon and the splash are the files this check reads', () => {
    expect(expo.icon).toBe('./assets/icon.png');
    expect(expo.android.adaptiveIcon).toMatchObject({
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    });
    const splash = expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
    expect(splash).toMatchObject({ image: './assets/splash-ring.png', imageWidth: 200, resizeMode: 'contain' });
    for (const f of [expo.icon, expo.android.adaptiveIcon.foregroundImage, expo.android.adaptiveIcon.backgroundImage, expo.android.adaptiveIcon.monochromeImage, splash.image]) {
      expect(existsSync(file(f))).toBe(true);
    }
  });

  it('the app is dark: splash and adaptive background are the void colour, userInterfaceStyle is dark', () => {
    const splash = expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
    expect(String(splash.backgroundColor).toLowerCase()).toBe(colour.background.toLowerCase());
    expect(String(splash.backgroundColor).toLowerCase()).toBe(colour.void.toLowerCase());
    expect(String(expo.android.adaptiveIcon.backgroundColor).toLowerCase()).toBe('#060608');
    expect(expo.userInterfaceStyle).toBe('dark');
    // Nothing light is left in the config: the old cream page or the old yellow.
    expect(JSON.stringify(expo)).not.toMatch(/fbf8f1|FDC621|"light"/i);
  });
});

describe('the pictures', () => {
  it('the iPhone icon is 1024 square, RGB, with no alpha channel, and is the dark Pulse picture (not the yellow mark)', () => {
    const p = decode('assets/icon.png');
    expect([p.width, p.height, p.colourType]).toEqual([1024, 1024, 2]);
    // Corners are square and dark (iOS rounds them; a rounded or cream corner would show).
    for (const [x, y] of CORNERS_1024) {
      const i = (y * 1024 + x) * 4;
      expect(px(p, i) + px(p, i + 1) + px(p, i + 2)).toBeLessThan(60);
    }
    // The hot-pink core sits at the centre of the play disc, left of the glyph.
    const c = (400 * 1024 + 420) * 4;
    expect(px(p, c)).toBeGreaterThan(200);
    expect(px(p, c + 2)).toBeGreaterThan(px(p, c + 1));
  });

  it('the in-app mark is the same picture: 1024, RGB', () => {
    const a = decode('assets/app-icon.png');
    expect([a.width, a.height, a.colourType]).toEqual([1024, 1024, 2]);
    expect(Buffer.from(a.rgba).equals(Buffer.from(decode('assets/icon.png').rgba))).toBe(true);
  });

  it('the Android foreground is 1024, transparent at the corners, and its ink fits the central 66 % (676 px)', () => {
    const p = decode('assets/android-icon-foreground.png');
    expect([p.width, p.height, p.colourType]).toEqual([1024, 1024, 6]);
    for (const [x, y] of CORNERS_1024) expect(alphaAt(p, x, y)).toBe(0);
    const r = reach(p);
    const lo = Math.round((1024 - 1024 * 0.66) / 2), hi = 1024 - lo;
    expect(r.x0).toBeGreaterThanOrEqual(lo); expect(r.y0).toBeGreaterThanOrEqual(lo);
    expect(r.x1).toBeLessThanOrEqual(hi); expect(r.y1).toBeLessThanOrEqual(hi);
    expect(r.x1 - r.x0).toBeGreaterThan(500); // and it is the ring, not an empty file
  });

  it('the Android background is solid void, RGB', () => {
    const p = decode('assets/android-icon-background.png');
    expect([p.width, p.height, p.colourType]).toEqual([1024, 1024, 2]);
    for (const i of [0, (512 * 1024 + 512) * 4, (1023 * 1024 + 1023) * 4]) expect([...p.rgba.subarray(i, i + 3)]).toEqual([6, 6, 8]);
  });

  it('the Android monochrome icon is one shape inside the same safe zone, transparent at the corners, not the old microphone', () => {
    const p = decode('assets/android-icon-monochrome.png');
    expect([p.width, p.height, p.colourType]).toEqual([1024, 1024, 6]);
    expect(alphaAt(p, 0, 0)).toBe(0);
    const r = reach(p);
    expect(r.x0).toBeGreaterThanOrEqual(174); expect(r.x1).toBeLessThanOrEqual(850);
    expect(r.y0).toBeGreaterThanOrEqual(174); expect(r.y1).toBeLessThanOrEqual(850);
    // The disc at the centre is solid, the play glyph is cut out of it.
    expect(alphaAt(p, 360, 481)).toBe(255);
    expect(alphaAt(p, 463, 481)).toBe(0);
  });

  it('the splash ring is 600 square, transparent at the corners and in the margin, with the ring centred', () => {
    const p = decode('assets/splash-ring.png');
    expect([p.width, p.height, p.colourType]).toEqual([600, 600, 6]);
    for (const [x, y] of CORNERS_600) expect(alphaAt(p, x, y)).toBe(0);
    const r = reach(p);
    expect(r.x0).toBeGreaterThan(60); expect(r.x1).toBeLessThan(540);
    expect(Math.abs((r.x0 + r.x1) / 2 - 300)).toBeLessThan(40);
    expect(alphaAt(p, 250, 300)).toBe(255); // the disc
  });
});
