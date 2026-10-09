// Draws the DEV app's icons: today's icons with a red "DEV" badge, so the two installs never look alike.
//
// Lane DP (dev + prod side by side): app.config.js points the dev build (APP_VARIANT=dev) at
// assets/dev/. The pictures are our own icons (assets/icon.png, assets/android-icon-foreground.png)
// with a badge drawn on top — the letters are plain shapes, so no font is needed.
//
//   node apps/mobile/scripts/render-dev-icons.mjs
//
// Writes apps/mobile/assets/dev/icon.png (iPhone, 1024, a red band along the bottom) and
// apps/mobile/assets/dev/android-icon-foreground.png (Android adaptive foreground, 1024, a red pill
// inside the 66 dp safe circle so no launcher mask cuts it). Uses @resvg/resvg-wasm, already
// installed for the API (as modules/alternate-icons/scripts/render-icons.mjs does).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, '..', 'assets');
const out = join(assets, 'dev');
const require = createRequire(import.meta.url);
const { initWasm, Resvg } = require('@resvg/resvg-wasm');

const RED = '#d92d20';
/** "DEV" in block letters, 410 × 160 at scale 1. */
const LETTERS = `
  <path fill-rule="evenodd" d="M0 0 H70 A50 80 0 0 1 70 160 H0 Z M36 36 H70 A14 44 0 0 1 70 124 H36 Z"/>
  <g transform="translate(150 0)">
    <rect x="0" y="0" width="36" height="160"/><rect x="0" y="0" width="110" height="32"/>
    <rect x="0" y="64" width="95" height="32"/><rect x="0" y="128" width="110" height="32"/>
  </g>
  <path transform="translate(290 0)" d="M0 0 H38 L60 110 L82 0 H120 L78 160 H42 Z"/>`;

function letters(cx, cy, scale) {
  const x = cx - (410 * scale) / 2;
  const y = cy - (160 * scale) / 2;
  return `<g fill="#ffffff" transform="translate(${x} ${y}) scale(${scale})">${LETTERS}</g>`;
}

function withBase(file, badge) {
  const b64 = readFileSync(join(assets, file)).toString('base64');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1024" width="1024" height="1024">
  <image width="1024" height="1024" xlink:href="data:image/png;base64,${b64}"/>
  ${badge}
</svg>`;
}

const ios = withBase('icon.png', `<rect x="0" y="790" width="1024" height="234" fill="${RED}"/>${letters(512, 900, 0.95)}`);
// The pill's far corners stay inside the safe circle (radius 313 round the centre).
const android = withBase('android-icon-foreground.png', `<rect x="392" y="706" width="240" height="96" rx="48" fill="${RED}"/>${letters(512, 754, 0.38)}`);

await initWasm(readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
mkdirSync(out, { recursive: true });
for (const [name, source] of [['icon.png', ios], ['android-icon-foreground.png', android]]) {
  writeFileSync(join(out, name), new Resvg(source, { fitTo: { mode: 'width', value: 1024 } }).render().asPng());
}
console.log(`wrote 2 dev icons to ${out}`);
