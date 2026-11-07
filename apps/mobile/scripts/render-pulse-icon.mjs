// Draws the phone app's icons from the owner-approved Pulse icon (M31 OQ1, 2026-10-28).
//
// Source: assets/brand/app-icon.svg (a copy of specs/033-m31-redesign/design-pulse2/icon/app-icon.svg,
// 1024 canvas). Run from the repo root:
//
//   node apps/mobile/scripts/render-pulse-icon.mjs
//
// Writes into apps/mobile/assets/:
//   icon.png, app-icon.png            1024, RGB, NO alpha (iOS rejects a transparent icon), square, no rounded
//                                     corners (iOS rounds it)
//   android-icon-foreground.png       1024, RGBA, ring + play on transparent, scaled to sit inside the central
//                                     66 % (676 px) safe zone
//   android-icon-background.png       1024, RGB, solid #060608 (app.json adaptiveIcon.backgroundColor matches)
//   android-icon-monochrome.png       1024, RGBA, one-colour shape (ring + disc, play cut out), same safe zone
//   splash-ring.png                   600, RGBA, ring + play on transparent (the native splash, imageWidth 200)
//   favicon.png                       48, RGB
// Uses @resvg/resvg-wasm (as render-dev-icons.mjs does) and encodes the PNGs itself so the opaque ones
// really carry no alpha channel. Re-run scripts/render-dev-icons.mjs afterwards (it badges icon.png).
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, '..', 'assets');
const require = createRequire(import.meta.url);
const { initWasm, Resvg } = require('@resvg/resvg-wasm');

const VOID = '#060608';
const src = readFileSync(join(assets, 'brand', 'app-icon.svg'), 'utf8');
const lines = src.match(/<line [^>]*\/>/g).join('');
const defs = src.match(/<defs>[\s\S]*?<\/defs>/)[0];
const PLAY = 'M 470 442 L 590 512 L 470 582 Z';
const CORE = '<circle cx="512" cy="512" r="150" fill="url(#core)"/>';

const svg = (inner, w = 1024) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${w}" height="${w}">${inner}</svg>`;
/** The ring's ink (lines incl. round caps) spans x 168.5-966.9, y 242.6-854.7: not centred on the canvas. */
const INK = { cx: 567.7, cy: 548.65 };
/** Shrink the ink about its own centre and put that centre on the canvas centre, so a launcher mask crops it evenly. */
const scaled = (inner, k) => `<g transform="translate(512 512) scale(${k}) translate(${-INK.cx} ${-INK.cy})">${inner}</g>`;
const mark = `${lines}${CORE}<path d="${PLAY}" fill="${VOID}"/>`;
/** The ink is 798 px wide; at 0.84 it is 670, inside the 676 (66 % of 1024) safe zone. */
const SAFE = 0.84;

const full = svg(src.replace(/^<svg[^>]*>|<\/svg>$/g, ''));
const foreground = svg(`${defs}${scaled(mark, SAFE)}`);
const background = svg(`<rect width="1024" height="1024" fill="${VOID}"/>`);
const mono = svg(`${scaled(`<g stroke="#fff" fill="none">${lines.replace(/stroke="[^"]*"/g, 'stroke="#fff"')}</g><path fill="#fff" fill-rule="evenodd" d="M 362 512 a 150 150 0 1 0 300 0 a 150 150 0 1 0 -300 0 Z ${PLAY}"/>`, SAFE)}`);
const splash = svg(`${defs}${scaled(mark, 0.9)}`);

function png(rgba, w, h, alpha) {
  const bpp = alpha ? 4 : 3;
  const raw = Buffer.alloc((w * bpp + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * bpp + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = y * (w * bpp + 1) + 1 + x * bpp;
      raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2];
      if (alpha) raw[d + 3] = rgba[s + 3];
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const t = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

await initWasm(readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
function render(source, size, alpha, name) {
  const r = new Resvg(source, { fitTo: { mode: 'width', value: size } }).render();
  writeFileSync(join(assets, name), png(r.pixels, r.width, r.height, alpha));
}
render(full, 1024, false, 'icon.png');
render(full, 1024, false, 'app-icon.png');
render(foreground, 1024, true, 'android-icon-foreground.png');
render(background, 1024, false, 'android-icon-background.png');
render(mono, 1024, true, 'android-icon-monochrome.png');
render(splash, 600, true, 'splash-ring.png');
render(full, 48, false, 'favicon.png');
console.log('wrote 7 Pulse icon files to', assets);
