#!/usr/bin/env node
// M31 fair captures (lane L10): where do the drawing's key elements sit, and where are they in the web build?
// Usage: node scripts/measure-compare.mjs [--web <exported dir>] [--screens launch,player,...] [--out <file.md>]
// For each of the six compared screens it opens the drawing's phone (design-pulse2, 390x844, no bezel) and the app route in the
// same frame as `capture-web.mjs --compare` (50 px status bar, 34 px home indicator inset, same fixtures), reads getBoundingClientRect
// of each element on both sides, and prints a markdown table: design x,y,w,h | build x,y,w,h | delta | match (every delta within 4 px).
// Design elements are found by CSS selector inside the drawing's `.ph` (Playwright selectors: :text-is(), :has-text() work);
// build elements by aria-label (getByLabel), text, or CSS. `grow` climbs from a found element to the first ancestor at least that big
// (a tile has no label of its own; its button does). Not found on either side prints "not found". Web build only; not a device.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { build, serve, openBuild, openDesign, renderArts, loadPlaywright, COMPARE, WAVE2, WAVE3, WAVE4, WAVE5, WAVE6, WAVE5B, WAVE7, LAUNCH } from './capture-web.mjs';
import { rmSync } from 'node:fs';

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? undefined : (process.argv[i + 1]?.startsWith('--') ? true : process.argv[i + 1] ?? true); };
const L = (label, nth = 0) => ({ label, nth });           // aria-label regex source, nth visible match (-1 = last)
const T = (text, nth = 0) => ({ text, nth });             // exact visible text
const C = (css, nth = 0) => ({ css, nth });
const U = (...parts) => ({ union: parts });               // bounding box of several
const G = (b, minW, minH) => ({ ...b, grow: [minW, minH] });
const TILE = (name) => ({ d: `div[style*="grid-column:span 1"][style*="grid-row:span 1"]:has-text("${name}")`, b: G(L(`^${name}$`), 120, 70) });

/** [screen, element, design selector, build finder]. */
export const SPECS = [
  ['launch', 'promotion image', 'div[style*="conic-gradient"]', L('^Promotion image$')],
  ['launch', 'app mark (30 px)', 'span[style*="width:30px;height:30px"]', C('[data-testid="launch-mark"] img')],
  ['launch', "'SocialNet' name", 'span:text-is("SocialNet")', { ...T('SocialNet'), line: true }],
  ['launch', 'skip pill', 'span.blur:has-text("Skip")', L('^Skip$')],
  ['launch', 'label + Open', 'div[style*="bottom:56px"][style*="flex-direction:column"]', L('^Promotion\\.')],

  ['player', 'close', 'span.ibtn >> nth=0', L('^Close the player')],
  ['player', 'hot pill', 'span.blur:has-text("next hot moment")', C('[data-testid="hot-pill"]')],
  ['player', 'More button', 'span.ibtn >> nth=1', L('^More$')],
  ['player', 'ring', 'div:has(> svg[viewBox="0 0 330 330"])', L('^Seek$')],
  ['player', 'cover', 'span[style*="width:204.6px"]', C('[data-testid="ring"] img')],
  ['player', 'title block', 'div:text-is("Why mornings matter")', T('Why mornings matter')],
  ['player', 'Follow pill', '.btn.ring', L('^Subscribe to this show')],
  ['player', 'controls row', 'div[style*="bottom:124px"]', U(L('^Speed 1'), L('^Pause$'), L('^Sleep timer'))],
  ['player', 'Play circle', 'span[style*="width:80px;height:80px"]', L('^(Pause|Play)$')],
  ['player', 'time bubble', 'span:has-text("−35:38"):not(:has(span))', C('[data-testid="player-bubble"]')],
  ['player', 'speed label', 'span:text-is("1.0×")', { ...L('^Speed 1'), line: true }],
  ['player', 'tray', 'div[style*="bottom:40px"][style*="height:60px"]', G(L('^Clip the last 30'), 340, 56)],

  ['player-more', 'More sheet', '.sheet', L('^More$', -1)],
  ['player-more', 'tile Clip', 'div[style*="height:84px"]:has-text("Clip")', L('^Clip the last 30', -1)],
  ['player-more', 'tile Share', 'div[style*="height:84px"]:has-text("Share")', L('^Share this episode$', -1)],
  ['player-more', 'tile Add to favourites', 'div[style*="height:84px"]:has-text("Add to favourites")', L('^Add to favourites')],
  ['player-more', 'tile About', 'div[style*="height:84px"]:has-text("About")', L('^About this episode')],
  ['player-more', 'tile Transcript', 'div[style*="height:84px"]:has-text("Transcript")', L('^Transcript$')],
  ['player-more', 'tile Chapters', 'div[style*="height:84px"]:has-text("Chapters")', L('^Chapters')],

  ['player-playback', 'Playback sheet', '.sheet', L('^Playback$')],
  ['player-playback', 'speed dial', 'div[style*="width:176px"][style*="height:176px"]', L('^Speed$')],
  ['player-playback', 'preset chips', 'div[style*="grid-template-columns:1fr 1fr"]', U(L('^1×$'), L('^2×$'))],
  ['player-playback', 'sleep rings', 'div[style*="justify-content:space-between"]:has(> div[style*="width:46px"])', U(L('^Sleep in 5 '), L('^Sleep in 60 '))],
  ['player-playback', 'End of episode chip', '.chip:has-text("End of episode")', L('^Stop at the end')],
  ['player-playback', 'More settings tile', ':text("Loop, audio output") >> xpath=../..', L('^More settings')],
  ['player-playback', 'title Playback', 'span:text-is("Playback")', { ...T('Playback'), line: true, range: true }],
  ['player-playback', 'default line (hot)', 'div:text-is("Set 1.2× as default (this show remembers its own)")', { ...L('^Set 1\\.2× as default'), line: true, range: true }],
  ['player-playback', 'sleep line', 'span:has-text("pausing in")', { union: [{ ...T('^pausing in'), range: true }, { ...L('^Cancel the sleep'), range: true }], line: true }],
  ['player-playback', 'Done pill', '.btn.light:text-is("Done")', L('^Close$', -1)],

  ['moments', 'sound pill', 'span.blur:has-text("Sound")', L('^Sound ')],
  ['moments', 'comment pills (stack)', 'div[style*="top:118px"][style*="flex-direction:column"]', L('^Top comments', 0)],
  ['moments', 'action column', 'div[style*="bottom:300px"]', U(L('^React at'), L('^Share a clip'))],
  ['moments', 'hot pill', '.ts.solid', C('[data-testid="hot-tag"]')],
  ['moments', 'title block', 'span:text-is("Why mornings matter")', T('Why mornings matter')],
  ['moments', 'Play circle', 'span[style*="width:56px;height:56px"][style*="border-radius:50%"]', L('^(Play|Pause) from', 0)],
  ['moments', 'flame action', 'div:has(> svg):has-text("2.4k") >> nth=0', L('^React at', 0)],
  ['moments', 'Moments curve', 'div[style*="bottom:168px"] .bars', L('^Where people reacted', 0)],
  ['moments', 'switch capsule', 'span.blur:has(> span:text-is("Moments"))', C('[role="tablist"]:has([aria-label="Moments"])')],
  ['moments', 'search circle', 'span.blur.ibtn', L('^Search\\.')],
  ['moments', 'tab bar (58 + the 34 strip)', 'div[style*="height:92px"][style*="border-top"]', { ...C('[role="tablist"]:has([aria-label="Me"])'), strip: true }],

  ['discover', 'pick tile', 'div[style*="grid-column:span 2"][style*="grid-row:span 3"]', G(L('^Open Why mornings matter'), 340, 250)],
  ['discover', 'pick: Play', '.btn.light:has-text("Play")', L('^Play Why mornings matter$')],
  ['discover', 'hot-now tile', 'div[style*="grid-row:span 2"]', L('^Hot now')],
  ['discover', 'tile Categories', ...Object.values(TILE('Categories'))],
  ['discover', 'tile Queue', ...Object.values(TILE('Queue'))],
  ['discover', 'tile Issues', ...Object.values(TILE('Issues'))],
  ['discover', 'tile Friends listening', ...Object.values(TILE('Friends listening'))],
  ['discover', 'tile Premium', ...Object.values(TILE('Premium'))],
  ['discover', 'tile Academy', ...Object.values(TILE('Academy'))],
  ['discover', 'tile Plaza', ...Object.values(TILE('Plaza'))],
  ['discover', 'tile Talked about', ...Object.values(TILE('Talked about'))],
  ['discover', 'title + date', 'div[style*="bottom:168px"] span:text-is("Discover")', { ...T('Discover'), line: true }],
  ['discover', 'edge label', '.edge', C('h1[aria-label="Today\'s pick"]')],
  ['discover', 'search field', '.field', G(L('^Search\\.'), 340, 40)],
  ['discover', 'switch capsule', 'span.blur:has(> span:text-is("Moments"))', C('[role="tablist"]:has([aria-label="Moments"])')],
  ['discover', 'tab bar (58 + the 34 strip)', 'div[style*="height:92px"][style*="border-top"]', { ...C('[role="tablist"]:has([aria-label="Me"])'), strip: true }],
  // ---- Wave 2 (lane W2-CAP): the boxes that are not words (tiles, fields, bars); the words are measured by `measureTexts`.
  ...['me', 'me-plus', 'me-signed-out'].flatMap((sc) => [
    [sc, 'tile Saved moments', 'div[style*="grid-row:span 2"]:has-text("Saved moments")', G(L('^Saved moments'), 150, 150)],
    ...['Notifications', 'Downloads', 'Listening history', 'Favourites', 'My comments', 'Queue'].map((n) => [sc, `tile ${n}`, `div[style*="grid-column:span 1"][style*="grid-row:span 1"][style*="border-radius:22px"]:has-text("${n}")`, G(L(`^${n}`), 120, 70)]),
    [sc, 'Stickers chip', 'span:has-text("Stickers") >> xpath=..', G(L('^Stickers$'), 60, 30)],
  ]),
  ['me-plus', 'PLUS banner', 'div:has(> div > div:text-is("SocialNet PLUS"))', G(L('^SocialNet PLUS'), 300, 70)],
  ...['chat', 'chat-empty', 'chat-error'].map((sc) => [sc, 'New chat (+)', 'span.ibtn', L('^New chat$')]),
  ['chat-signed-out', 'Sign in button', '.btn.light', L('^Sign in$')],
  ...['discover-fold-a', 'discover-fold-b'].flatMap((sc) => [
    [sc, 'search field', '.field', G(L('^Search\\.'), 340, 40)],
    [sc, 'tab bar (58 + the 34 strip)', 'div[style*="height:92px"][style*="border-top"]', { ...C('[role="tablist"]:has([aria-label="Me"])'), strip: true }],
  ]),
  ['comments-order', 'Order sheet', '.sheet', L('^Order', -1)],
];


// ---- Wave 2 (lane W2-CAP): the new screens are measured by their WORDS ----
// Every visible text node of the drawing's phone (status bar excluded) is paired with the same words in the build (case and spacing ignored),
// the nearest unused one by position, and the box of the words themselves (a Range, so the line box the app sets differently does not count)
// is compared on x, y, w, h. A drawn text with no partner is "not found (build)"; a build text with no partner is listed as build-only.
const norm = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase();
const READ_TEXTS = (root) => {
  const r0 = root ? root.getBoundingClientRect() : { x: 0, y: 0 };
  const out = [];
  const w = document.createTreeWalker(root ?? document.body, NodeFilter.SHOW_TEXT);
  let t;
  while ((t = w.nextNode())) {
    const s = t.textContent.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    const el = t.parentElement;
    if (!el || el.closest('#__sb, #__hb, script, style') ) continue;
    { let a = el, behind = false; while (a) { if (a.nodeType === 1 && getComputedStyle(a).zIndex === '-1') { behind = true; break; } a = a.parentElement; } if (behind) continue; }  // the tab that is not open stays mounted, behind (an ancestor at z-index -1)
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;  // a tab that is not the open one is still in the page, at opacity 0 or off screen
    const rg = document.createRange(); rg.selectNodeContents(t);
    const b = rg.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    const x = b.x - r0.x, y = b.y - r0.y;
    if (y < 0 || y + b.height > 846 || x < 0 || x + b.width > 392) continue;
    out.push({ s, x, y, w: b.width, h: b.height });
  }
  return out;
};
const STATUS = /^(9:41|5g\s*▮*)$/i;
export async function measureTexts(ph, rect, page) {
  // A sheet or dialog: only its own words count (the page dimmed behind it is the base screen's row). Its top is the drawn `.sheet` top.
  const sh = ph.locator('.sheet').first();
  const sb = (await sh.count()) ? await sh.boundingBox() : null;
  const minY = sb && sb.height < 800 ? sb.y - rect.y - 4 : 40;
  const D = (await ph.evaluate(READ_TEXTS)).filter((t) => !STATUS.test(t.s) && t.y > minY && !(t.y > 760 && /^(Journey|zzzqqqxx)$/.test(t.s)));  // the search field's typed word is an <input> value in the build, not a text node
  const B = (await page.evaluate(`(${READ_TEXTS.toString()})(null)`)).filter((t) => !STATUS.test(t.s) && t.y > (minY > 40 ? minY - 120 : 40));
  const used = new Set();
  const rows = [];
  for (const d of D) {
    let best = -1, bd = 1e9;
    B.forEach((b, i) => { if (used.has(i) || norm(b.s) !== norm(d.s)) return; const dd = Math.abs(b.y - d.y) + Math.abs(b.x - d.x) * 0.25; if (dd < bd) { bd = dd; best = i; } });
    if (best < 0) { rows.push({ name: d.s, d, b: null }); continue; }
    used.add(best); rows.push({ name: d.s, d, b: B[best] });
  }
  const extra = B.filter((_, i) => !used.has(i)).map((t) => t.s);
  return { rows, extra };
}

/** Rect of a build element in page (= phone) coordinates, or null. */
async function findBuild(page, f) {
  const one = async (g) => {
    let loc;
    if (g.label) loc = page.getByLabel(new RegExp(g.label)).and(page.locator(':visible'));
    else if (g.text) loc = page.getByText(new RegExp(g.text.startsWith('^') ? g.text : `^${g.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)).and(page.locator(':visible'));
    else loc = page.locator(g.css).and(page.locator(':visible'));
    const n = await loc.count();
    if (!n) return null;
    const i = (g.nth ?? 0) < 0 ? n + g.nth : g.nth ?? 0;
    if (i < 0 || i >= n) return null;
    const h = await loc.nth(i).elementHandle();
    const r = await h.evaluate((el, g) => {
      const grow = g.grow;
      let e = el;
      if (grow) { let c = el; while (c.parentElement && (c.getBoundingClientRect().width < grow[0] || c.getBoundingClientRect().height < grow[1])) c = c.parentElement; e = c; }
      // `range`: the box of the words themselves (a Text that is flex: 1 is as wide as its row; the words are not).
      const b = g.range ? (() => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect(); })() : e.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    }, g);
    // `strip`: the drawing's tab bar is 92 = 58 + the 34 home strip; the app's root paints the strip (bg-void) under its 58 bar, so the bar runs to the window's foot.
    if (g.strip && r.y + r.h < 844) r.h = 844 - r.y;
    return r;
  };
  if (f.union) {
    const rs = (await Promise.all(f.union.map(one)));
    if (rs.some((r) => !r)) return null;
    const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
    return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
  }
  return one(f);
}

async function findDesign(ph, rect, sel) {
  const loc = ph.locator(sel).first();
  if (!(await loc.count())) return null;
  const b = await loc.boundingBox();
  return b ? { x: b.x - rect.x, y: b.y - rect.y, w: b.width, h: b.height } : null;
}

const fmt = (r) => (r ? [r.x, r.y, r.width ?? r.w, r.h ?? r.height].map((v) => Math.round(v)).join(', ') : 'not found');

export async function measure(browser, base, screens, arts) {
  const lines = [];
  let ok = 0, total = 0, missing = 0;
  for (const screen of screens) {
    const specs = SPECS.filter((s) => s[0] === screen);
    const d = await openDesign(browser, screen, 1);
    const rect = d.rect;
    const b = await openBuild(browser, base, screen, { frame: true, arts }).catch((e) => ({ err: e }));
    lines.push(`\n### ${screen}\n`);
    if (b.err) { lines.push(`build did not open: ${String(b.err).slice(0, 160)}\n`); }
    lines.push('| element | design x,y,w,h | build x,y,w,h | delta x,y,w,h | within 4 px |', '|---|---|---|---|---|');
    for (const [, name, dsel, bf] of specs) {
      const dr = await findDesign(d.ph, rect, dsel).catch(() => null);
      const br = b.err ? null : await findBuild(b.page, bf).catch(() => null);
      total++;
      if (!dr || !br) { missing++; lines.push(`| ${name} | ${fmt(dr)} | ${fmt(br)} | | ${!dr && !br ? 'not found (both)' : !br ? 'not found (build)' : 'not found (design)'} |`); continue; }
      let dl = [br.x - dr.x, br.y - dr.y, br.w - dr.w, br.h - dr.h];
      // `line`: one line of words. The box height is the line box (the app sets the font's own height, `lineSafe`, where the drawing sets a tighter one),
      // so what is compared is where the words sit: the centre of the box, not its top and height.
      if (bf.line) dl = [dl[0], (br.y + br.h / 2) - (dr.y + dr.h / 2), dl[2], 0];
      const match = dl.every((v) => Math.abs(v) <= 4);
      if (match) ok++;
      lines.push(`| ${name} | ${fmt(dr)} | ${fmt(br)} | ${dl.map((v) => (v > 0 ? '+' : '') + Math.round(v)).join(', ')} | ${match ? (bf.line ? 'yes (centre of the line)' : 'yes') : 'NO'} |`);
    }
    if ([...WAVE2, ...WAVE3, ...WAVE4, ...WAVE5, ...WAVE6, ...WAVE5B, ...WAVE7].includes(screen) && !b.err) {
      const { rows, extra } = await measureTexts(d.ph, rect, b.page);
      lines.push('', '| text (drawn words) | design x,y,w,h | build x,y,w,h | delta x,y,w,h | within 4 px |', '|---|---|---|---|---|');
      for (const r of rows) {
        total++;
        if (!r.b) { missing++; lines.push(`| ${r.name.slice(0, 44).replace(/\|/g, '/')} | ${fmt(r.d)} | not found | | not found (build) |`); continue; }
        const dl = [r.b.x - r.d.x, r.b.y - r.d.y, r.b.w - r.d.w, r.b.h - r.d.h];
        const match = dl.every((v) => Math.abs(v) <= 4);
        if (match) ok++;
        lines.push(`| ${r.name.slice(0, 44).replace(/\|/g, '/')} | ${fmt(r.d)} | ${fmt(r.b)} | ${dl.map((v) => (v > 0 ? '+' : '') + Math.round(v)).join(', ')} | ${match ? 'yes' : 'NO'} |`);
      }
      lines.push('', `Build-only text (no drawn partner): ${extra.length ? extra.map((x) => `"${x.slice(0, 40)}"`).join(', ') : 'none'}`);
    }
    await d.ctx.close(); if (!b.err) await b.ctx.close();
  }
  lines.push(`\n${ok} of ${total} elements within 4 px on all four numbers; ${missing} not found on one side. Web build (Playwright Chromium 390x844), not a device.`);
  return lines.join('\n');
}

async function main() {
  const pw = loadPlaywright();
  const given = typeof arg('web') === 'string';
  const web = build();
  const server = await serve(web);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await pw.chromium.launch(LAUNCH);
  const arts = await renderArts(browser);
  const screens = typeof arg('screens') === 'string' ? String(arg('screens')).split(',') : arg('wave2') ? WAVE2 : arg('wave3') ? WAVE3 : arg('wave4') ? WAVE4 : arg('wave5') ? WAVE5 : arg('wave6') ? WAVE6 : arg('wave5b') ? WAVE5B : arg('wave7') ? WAVE7 : COMPARE;
  const md = await measure(browser, base, screens, arts);
  console.log(md);
  if (typeof arg('out') === 'string') writeFileSync(path.resolve(String(arg('out'))), md + '\n');
  await browser.close(); server.close();
  if (!given && arg('keep') !== true) rmSync(web, { recursive: true, force: true });
}
main();
