// M31 lane K (T094 font scale 2, T105 widths): captures of the web build with the page's font scale or width changed.
//   node m31/capture-k.mjs --mode fontscale --web <exported dir> --out <dir> [--routes a,b]
//   node m31/capture-k.mjs --mode widths    --web <exported dir> --out <dir> [--routes a,b]
//   add --scale 1.3 to --mode fontscale for the capped scale (files <name>-1.3-build.png)
// Web build only, NOT a device. Font scale: react-native-web draws Text at fixed CSS px and ignores fontScale, so (1) the page's
// stylesheet rules are rewritten as they are inserted (every font-size / line-height in px x2, what iOS Dynamic Type "200 %" does to
// Text that has no cap) and (2) the copy of the bundle reports fontScale 2 to useWindowDimensions (TitleBar, CommentsBottom read it).
// Caveat: iOS keeps `maxFontSizeMultiplier` caps (10 in the app); the web ignores them, so a capped text is drawn larger here than on a phone.
import { mkdirSync, cpSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROUTES, build, serve, setAnswerHook, renderArts, openBuild, loadPlaywright, LAUNCH } from '../scripts/capture-web.mjs';
import { LONG, WIDTH_ROUTES } from './capture-w7.mjs';

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? undefined : (process.argv[i + 1]?.startsWith('--') ? true : process.argv[i + 1] ?? true); };
const mode = String(arg('mode') ?? 'fontscale');
const out = path.resolve(String(arg('out') ?? `capture-k-${mode}`));
const web0 = path.resolve(String(arg('web')));
// --scale S (default 2): the page's font scale. 2 = iOS 200 % on Text with no cap. 1.3 = what a user at the largest setting sees on Text that
// carries the app's cap (TYPE_CAP = 1.3 in src/ui/kit/Type.tsx; the phone draws min(userScale, cap)). Files get a `-<S>` suffix when S is not 2.
const SCALE = Number(arg('scale') ?? 2);
const SUF = SCALE === 2 ? '' : `-${SCALE}`;

const FONTX = (S) => {
  const orig = CSSStyleSheet.prototype.insertRule;
  CSSStyleSheet.prototype.insertRule = function (rule, i) {
    return orig.call(this, rule.replace(/(font-size|line-height):\s*(-?[\d.]+)px/g, (_, p, n) => `${p}:${(parseFloat(n) * S).toFixed(2)}px`), i);
  };
  // inline styles (react-native-web puts lineHeight and some sizes inline): double each once, keep what we wrote so a re-render is scaled again
  const done = new WeakMap();
  const fix = (el) => {
    const st = el.style; if (!st || el.closest('#__sb')) return;
    for (const k of ['fontSize', 'lineHeight']) {
      const v = st[k]; if (!v.endsWith('px')) continue;
      if (done.get(el)?.[k] === v) continue;
      const nv = `${(parseFloat(v) * S).toFixed(2)}px`; st[k] = nv; done.set(el, { ...(done.get(el) ?? {}), [k]: st[k] });
    }
  };
  const all = (root) => { if (root.nodeType === 1) { fix(root); root.querySelectorAll('[style]').forEach(fix); } };
  new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'attributes') fix(m.target); else m.addedNodes.forEach(all); } }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
};

function patchedCopy(src, fontScale) {
  const dst = `${src}-fs${fontScale}`;
  rmSync(dst, { recursive: true, force: true });
  cpSync(src, dst, { recursive: true });
  const js = path.join(dst, '_expo', 'static', 'js', 'web');
  let n = 0;
  for (const f of readdirSync(js).filter((x) => x.endsWith('.js'))) {
    const p = path.join(js, f); let t = readFileSync(p, 'utf8');
    const t2 = t.replaceAll('fontScale:1', `fontScale:${fontScale}`); n += t.split('fontScale:1').length - 1;
    if (t2 !== t) writeFileSync(p, t2);
  }
  const css = path.join(dst, '_expo', 'static', 'css');
  if (existsSync(css)) for (const f of readdirSync(css).filter((x) => x.endsWith('.css'))) { const p = path.join(css, f); writeFileSync(p, readFileSync(p, 'utf8').replace(/font-size:(\d+(?:\.\d+)?)px/g, (_, v) => `font-size:${v * fontScale}px`).replace(/,(\d+(?:\.\d+)?)px\)/g, (_, v) => `,${v * fontScale}px)`)); }
  console.log(`bundle: ${n} fontScale:1 -> ${fontScale}; css font-size and line-height px x${fontScale}`);
  return dst;
}

const FS_ROUTES = String(arg('routes') ?? 'player,moments,discover,episode,comments,me,search-all,updates,player-playback').split(',');
const FS_ALIAS = { updates: 'library--screen' };

/** The routes' steps tap controls by the words of the sample titles; with long titles the same controls are named by the long words. */
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function longRoute(r) {
  const sw = (a) => (typeof a === 'string' ? a.replaceAll('Why mornings matter', LONG.episode).replaceAll('Morning Notes', LONG.show) : a instanceof RegExp ? new RegExp(a.source.replaceAll('Why mornings matter', esc(LONG.episode)).replaceAll('Morning Notes', esc(LONG.show)), a.flags) : Array.isArray(a) ? a.map(sw) : a);
  return { ...r, steps: r.steps.map(([k, a]) => [k, sw(a)]) };
}

async function main() {
  const pw = loadPlaywright();
  mkdirSync(out, { recursive: true });
  build();  // patches the exported bundle for the capture (idempotent)
  const web = mode === 'fontscale' ? patchedCopy(web0, SCALE) : web0;
  const server = await serve(web);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await pw.chromium.launch(LAUNCH);
  const arts = await renderArts(browser);
  const fails = [];
  const jobs = mode === 'fontscale'
    ? FS_ROUTES.map((r) => ({ file: `${r}${SUF}-build.png`, name: FS_ALIAS[r] && ROUTES[FS_ALIAS[r]] ? FS_ALIAS[r] : r, viewport: { width: 390, height: 844 }, init: [{ content: `(${FONTX.toString()})(${SCALE})` }] }))
    : WIDTH_ROUTES(String(arg('routes') ?? ''));
  for (const j of jobs) {
    const errors = [];
    setAnswerHook(j.hook ?? null);
    try {
      const b = await openBuild(browser, base, j.name, { frame: true, arts, errors, viewport: j.viewport, initScripts: j.init ?? [], route: j.hook ? longRoute(ROUTES[j.name]) : j.route, onPage: (p) => { globalThis.__page = p; p.__jsClick = mode === 'fontscale'; } });
      await b.page.screenshot({ path: path.join(out, j.file) });
      if (j.after) await j.after(b.page, out);
      await b.ctx.close();
      console.log(`ok   ${j.file}${errors.length ? `  (page errors ${errors.length})` : ''}`);
    } catch (e) { fails.push(`${j.file}: ${String(e).slice(0, 200)}`); console.log(`FAIL ${j.file}`, errors.join(' // ').slice(0, 600)); if (globalThis.__page) await globalThis.__page.screenshot({ path: path.join(out, j.file.replace('-build', '-FAIL')) }).catch(() => {}); }
  }
  await browser.close(); server.close();
  if (fails.length) { console.log('\nFailures:\n' + fails.join('\n')); process.exitCode = 1; }
}
main();
