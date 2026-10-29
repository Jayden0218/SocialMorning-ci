// Lane K3: rebuild a wave's overview sheet (design | build | diff, 4 columns) from the PNGs already in a directory, without
// re-capturing (capture-web.mjs's own sheet step crashes on a very large wave, e.g. wave 5 with 130 screens in one column).
// Usage: node m31/capture-sheet.mjs <dir> <sheet-name> [cols=4]
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { contactSheet, loadPlaywright, LAUNCH } from '../scripts/capture-web.mjs';
const [dir, name, cols = '4'] = process.argv.slice(2);
const d = path.resolve(dir);
const names = readdirSync(d).filter((f) => f.endsWith('-design.png')).map((f) => f.slice(0, -'-design.png'.length)).sort();
const pw = loadPlaywright();
const browser = await pw.chromium.launch(LAUNCH);
await contactSheet(browser, d, names, { file: `${name}.png`, cols: Number(cols) });
await browser.close();
console.log(`${names.length} screens -> ${path.join(d, name + '.png')}`);
