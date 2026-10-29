#!/usr/bin/env node
/**
 * M31 (T003): the action replay. Compares the current action inventory with the baseline taken
 * before the redesign (m31/actions-before.json): per file, every action (name + destination) that
 * existed must still exist. A moved or renamed action passes only if m31/moves.json lists it with
 * a reason and either a `now` target (in the move's own file, or in a file named by `via`; the shared TitleBar never
 * counts) or `removed: true` (a drop the drawings approve). New actions are reported, never failed.
 *
 *   node scripts/action-replay.mjs [--wave N] [--before file] [--now file] [--moves file]
 *
 * --now reads a ready inventory instead of running action-inventory.mjs (used by the tests).
 * --wave N limits the check to files that m31/waves.json puts in wave N (files found through the
 * `covers` of m27/inventory entries). Exit 1 and the surface + action on any missing one.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const key = (e) => `${e.name}\u0000${e.destination}`;
const show = (e) => `"${e.name}" -> ${e.destination}`;

/** Pure: before/now are inventory objects; moves is the parsed moves.json; files is an optional Set filter. */
export function compare(before, now, moves = { moves: [] }, files = null) {
  const group = (inv) => {
    const m = new Map();
    for (const e of inv.entries) {
      if (files && !files.has(e.file)) continue;
      if (!m.has(e.file)) m.set(e.file, { surface: e.surface, items: new Map() });
      const g = m.get(e.file).items;
      g.set(key(e), (g.get(key(e)) ?? 0) + 1);
    }
    return m;
  };
  const b = group(before);
  const n = group(now);
  const allNow = new Set(now.entries.map((e) => `${e.file}\u0001${key(e)}`));
  // A move needs a reason, and either a `now` target or `removed: true` (an approved drop).
  const okMove = (m) => m && String(m.reason ?? '').trim() && m.file && m.name !== undefined && (m.now || m.removed === true);
  const listed = (moves.moves ?? []).filter(okMove);
  const problems = []; // moves.json entries with no reason, or with neither `now` nor `removed: true`
  for (const m of moves.moves ?? []) if (!okMove(m)) problems.push(m);
  // The target must be in the move's own screen file, or in a file the move names in `via`. The shared
  // TitleBar is never a valid place: the screen's own action entry has to exist.
  const SHARED = /(^|\/)src\/ui\/kit\/TitleBar\.tsx$/;
  const targetOk = (mv) => {
    const t = mv.now;
    if (!t) return false;
    const allowed = t.file === mv.file || (Array.isArray(mv.via) && mv.via.includes(t.file));
    return allowed && !SHARED.test(t.file) && allNow.has(`${t.file}\u0001${t.name}\u0000${t.destination}`);
  };
  // The screen side. A move into a kit part works only if the screen still passes a real handler for the
  // prop the part calls (`props.onQueue` -> `onQueue`), going where the move says. Read from `now.passes`
  // (absent in hand-built test inventories: then only the target entry is checked).
  const passes = now.passes ?? null;
  const PROP = /^(?:props\.)?(?:actions\.)?(on[A-Z]\w*)$/;
  const known = (moves.known ?? []).filter((k) => k && String(k.reason ?? '').trim());
  const knownHit = [];
  let screenChecked = 0;
  let unverifiable = 0;
  const unverifiedList = [];
  // One passer file's verdict for the prop: null (fine or unknown) or the reason it is lost.
  const checkFile = (mv, file, prop, mine) => {
    const spread = passes.some((p) => p.file === file && p.form === 'spread');
    if (!mine.length) return spread ? null : `the screen ${file} no longer passes ${prop}`;
    const real = mine.filter((p) => !p.empty);
    if (!real.length) return `the screen ${file} passes an empty handler for ${prop} (${mine[0].handler || 'none'})`;
    // `handlerHas` (a string or list, in the move): the handler's new spelling when the screen's own was renamed.
    const hh = mv.handlerHas === undefined ? null : [].concat(mv.handlerHas);
    if (hh && !real.some((p) => hh.some((x) => p.handler.includes(x)))) return `the screen ${file} passes ${prop} to ${[...new Set(real.map((p) => p.handler))].join(', ')}, not ${hh.join(' / ')}`;
    const dest = mv.destination;
    if (!hh && dest && dest !== 'dynamic' && !/^(?:props|actions)\./.test(dest)) {
      // Reaches the destination: the handler says it, or the file still names it (a wrapper like `open` -> router.push).
      const toks = new Set(now.fileTokens?.[file] ?? []);
      const ok = real.some((p) => p.destination === dest || p.handler.includes(dest)) || toks.has(dest);
      if (!ok) return `the screen ${file} passes ${prop} to ${[...new Set(real.map((p) => p.destination))].join(', ')}, not ${dest}`;
    }
    return null;
  };
  const screenSide = (mv) => {
    if (!passes || !mv.now || mv.removed === true) return null;
    // `passesProp` (in the move): the screen-side prop when the target's destination is not itself a prop (e.g. `compose` <- ComposerBar onOpen).
    const pm = mv.passesProp ? [null, mv.passesProp] : PROP.exec(mv.now.destination ?? '');
    if (!pm) return null;
    const prop = pm[1];
    const viaMove = Array.isArray(mv.via) && mv.via.length && mv.now.file !== mv.file;
    let byFile;
    if (mv.passesFile || viaMove) {
      const file = mv.passesFile ?? mv.file;
      byFile = new Map([[file, passes.filter((p) => p.file === file && p.prop === prop)]]);
    } else {
      // The part owns the action itself: every file that passes `prop` to that component is a passer.
      const tag = mv.passesTag ?? path.basename(mv.now.file).replace(/\.[tj]sx?$/, '');
      byFile = new Map();
      // Every file that renders the part is a passer (also one that no longer passes the prop at all).
      for (const u of now.usages ?? []) if (u.tag === tag && u.file !== mv.now.file && !byFile.has(u.file)) byFile.set(u.file, []);
      for (const p of passes) if (p.prop === prop && p.tag === tag) { if (!byFile.has(p.file)) byFile.set(p.file, []); byFile.get(p.file).push(p); }
      for (const [f, list] of byFile) if (!list.length) byFile.set(f, passes.filter((p) => p.file === f && p.prop === prop && p.tag === tag));
      if (!byFile.size) { unverifiable++; unverifiedList.push({ file: mv.file, name: mv.name, prop }); return null; }
    }
    screenChecked++;
    for (const [file, mine] of byFile) { const bad = checkFile(mv, file, prop, mine); if (bad) return bad; }
    return null;
  };
  const surfaces = [];
  const missing = [];
  let total = 0; let kept = 0;
  for (const [file, g] of [...b].sort(([x], [y]) => x.localeCompare(y))) {
    const cur = n.get(file)?.items ?? new Map();
    let sKept = 0; let sTotal = 0; let sMoved = 0; let sAdded = 0;
    for (const [k, count] of g.items) {
      const [name, destination] = k.split('\u0000');
      const have = cur.get(k) ?? 0;
      const lost = Math.max(0, count - have);
      sTotal += count; sKept += count - lost;
      for (let i = 0; i < lost; i++) {
        const mv = listed.find((m) => m.file === file && m.name === name && (m.destination === undefined || m.destination === destination));
        const toOk = mv && (mv.removed === true || targetOk(mv));
        const bad = toOk && mv.removed !== true ? screenSide(mv) : null;
        const kn = bad && known.find((k) => k.file === file && k.name === name && (k.destination === undefined || k.destination === destination));
        if (kn) { knownHit.push({ surface: g.surface, file, name, destination, why: bad, reason: kn.reason }); sMoved++; sKept++; }
        else if (mv && toOk && !bad) { sMoved++; sKept++; }
        else missing.push({ surface: g.surface, file, name, destination, why: bad ?? (mv ? `listed move target ${JSON.stringify(mv.now)} not found in ${file}${mv.via ? ' or via' : ''}` : 'missing') });
      }
    }
    for (const [k, count] of cur) sAdded += Math.max(0, count - (g.items.get(k) ?? 0));
    total += sTotal; kept += sKept;
    surfaces.push({ surface: g.surface, file, total: sTotal, kept: sKept, moved: sMoved, added: sAdded });
  }
  return { surfaces, missing, problems, known: knownHit, screenChecked, unverifiable, unverifiedList, total, kept, pct: total ? (100 * kept) / total : 100 };
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** files that belong to wave N: from m31/waves.json (entry name -> wave) and each entry's `covers`. */
export function filesOfWave(wave, wavesPath = path.join(MOBILE, 'm31/waves.json'), invDir = path.join(MOBILE, 'm27/inventory')) {
  const waves = readJson(wavesPath).waves;
  const set = new Set();
  for (const f of readdirSync(invDir)) {
    for (const e of readJson(path.join(invDir, f))) {
      if (waves[e.name] !== wave) continue;
      for (const c of e.covers ?? []) set.add(`apps/mobile/${c.split('::')[0]}`);
    }
  }
  return set;
}

function main(argv) {
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const beforeP = opt('--before') ?? path.join(MOBILE, 'm31/actions-before.json');
  const movesP = opt('--moves') ?? path.join(MOBILE, 'm31/moves.json');
  const wave = opt('--wave') ? Number(opt('--wave')) : null;
  const before = readJson(beforeP);
  const now = opt('--now')
    ? readJson(opt('--now'))
    : JSON.parse(execFileSync('node', [path.join(MOBILE, 'scripts/action-inventory.mjs')], { maxBuffer: 1 << 28 }).toString());
  const moves = existsSync(movesP) ? readJson(movesP) : { moves: [] };
  const files = wave ? filesOfWave(wave) : null;
  const r = compare(before, now, moves, files);
  for (const s of r.surfaces) {
    console.log(`${s.kept === s.total ? 'ok  ' : 'FAIL'} ${s.surface.padEnd(34)} ${s.kept}/${s.total}` + (s.moved ? ` (${s.moved} moved)` : '') + (s.added ? ` (+${s.added} new)` : ''));
  }
  for (const p of r.problems) console.log(`BAD moves.json entry (needs file, name, reason): ${JSON.stringify(p)}`);
  for (const k of r.known) console.log(`KNOWN   ${k.surface} (${k.file}): ${show(k)} [${k.why}] -- ${k.reason}`);
  for (const m of r.missing) console.log(`MISSING ${m.surface} (${m.file}): ${show(m)} [${m.why}]`);
  console.log(`\nmoves checked at the screen side: ${r.screenChecked}; known exceptions: ${r.known.length}; unverifiable (no passer found): ${r.unverifiable}`);
  for (const u of r.unverifiedList) console.log(`UNVERIFIED ${u.file}: "${String(u.name).slice(0, 50)}" -> ${u.prop}`);
  console.log(`actions kept: ${r.kept}/${r.total} = ${r.pct.toFixed(1)}%${wave ? ` (wave ${wave}, ${r.surfaces.length} files)` : ''}`);
  const bad = r.missing.length > 0 || r.problems.length > 0;
  console.log(bad ? 'RED' : 'GREEN');
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
