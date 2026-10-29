// M31 fair captures (lane L10): the capture's sample data = the drawings' sample data (design-pulse2).
// `node m31/capture-fixture.mjs` regenerates capture-fixture.json: the 100 heat buckets are evaluated from the
// drawing's own kit.js heat() (PK.H) and the art gradients (PK.art) are read from kit.js, so nothing is copied by hand.
// `loadFixture()` is what capture-web.mjs imports: it returns the objects the request interceptor answers with.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
export const JSON_PATH = path.join(here, 'capture-fixture.json');
export const DESIGN_DIR = path.resolve(here, '../../../specs/033-m31-redesign/design-pulse2');

export async function generate() {
  const req = createRequire(import.meta.url);
  const pw = req('playwright');
  const b = await pw.chromium.launch();
  const p = await b.newPage();
  await p.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  await p.goto(pathToFileURL(path.join(DESIGN_DIR, 'index.html')).href);
  const { H, arts } = await p.evaluate(() => ({ H: window.PK.H, arts: Object.fromEntries('abcdefgh'.split('').map((k) => [k, window.PK.art(k)])) }));
  await b.close();
  const prev = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  prev.heat.buckets = H.map((v) => Math.round(v * prev.heat.peakReacting));
  prev.heat.normalised = H.map((v) => Number(v.toFixed(4)));
  prev.arts = arts;
  writeFileSync(JSON_PATH, JSON.stringify(prev, null, 1) + '\n');
  console.log(`capture-fixture.json: ${H.length} heat buckets, peaks at`, [14, 30, 47, 63, 82].map((k) => `${k}=${prev.heat.buckets[k]}`).join(' '));
}
export const loadFixture = () => JSON.parse(readFileSync(JSON_PATH, 'utf8'));
if (import.meta.url === pathToFileURL(process.argv[1]).href) generate();
