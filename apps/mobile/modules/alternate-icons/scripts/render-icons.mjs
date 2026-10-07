// Draws our 4 alternate app icons (Sunrise, Ocean, Forest, Plum) as SVG and renders every PNG size.
//
// M22 T076 (moved from M20 T070): our own designs — the SocialNet mark (a speech bubble round a
// microphone) on the accent colours of src/design/tokens.ts. Never 小宇宙's icons.
//
//   node apps/mobile/modules/alternate-icons/scripts/render-icons.mjs
//
// Writes apps/mobile/assets/icons/alt/<name>.svg and <name>-<size>.png. The sizes are the ones the
// config plugin (../plugin.js) copies: iOS 120/180 (iPhone) and 152/167 (iPad), Android mipmap
// 48/72/96/144/192, and 1024 as the master. Uses @resvg/resvg-wasm, already installed for the API.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '..', '..', 'assets', 'icons', 'alt');
const require = createRequire(import.meta.url);
const { initWasm, Resvg } = require('@resvg/resvg-wasm');

export const ICONS = {
  Sunrise: { top: '#ffb347', bottom: '#fcc522', bubble: '#ffffff', mic: '#2a2a2a' },
  Ocean: { top: '#2563eb', bottom: '#1d4ed8', bubble: '#ffffff', mic: '#ffffff' },
  Forest: { top: '#16a34a', bottom: '#15803d', bubble: '#ffffff', mic: '#ffffff' },
  Plum: { top: '#c026d3', bottom: '#a21caf', bubble: '#ffffff', mic: '#ffffff' },
};
export const SIZES = [48, 72, 96, 120, 144, 152, 167, 180, 192, 1024];

function svg(c) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.top}"/><stop offset="1" stop-color="${c.bottom}"/></linearGradient></defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <path d="M287 715 L232 832 L224 624 A318 318 0 1 1 287 715 Z" fill="none" stroke="${c.bubble}" stroke-width="44" stroke-linejoin="round"/>
  <rect x="428" y="270" width="168" height="330" rx="84" fill="${c.mic}"/>
  <path d="M384 528 A128 128 0 0 0 640 528" fill="none" stroke="${c.mic}" stroke-width="30" stroke-linecap="round"/>
  <line x1="512" y1="656" x2="512" y2="704" stroke="${c.mic}" stroke-width="30"/>
  <line x1="462" y1="708" x2="562" y2="708" stroke="${c.mic}" stroke-width="30" stroke-linecap="round"/>
  <line x1="340" y1="404" x2="340" y2="462" stroke="${c.bubble}" stroke-width="28" stroke-linecap="round"/>
  <line x1="378" y1="380" x2="378" y2="486" stroke="${c.bubble}" stroke-width="28" stroke-linecap="round"/>
  <line x1="646" y1="380" x2="646" y2="486" stroke="${c.bubble}" stroke-width="28" stroke-linecap="round"/>
  <line x1="684" y1="404" x2="684" y2="462" stroke="${c.bubble}" stroke-width="28" stroke-linecap="round"/>
</svg>
`;
}

await initWasm(readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
mkdirSync(out, { recursive: true });
for (const [name, colours] of Object.entries(ICONS)) {
  const source = svg(colours);
  const base = name.toLowerCase();
  writeFileSync(join(out, `${base}.svg`), source);
  for (const size of SIZES) {
    const png = new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng();
    writeFileSync(join(out, `${base}-${size}.png`), png);
  }
}
console.log(`wrote ${Object.keys(ICONS).length} icons × ${SIZES.length} sizes to ${out}`);
