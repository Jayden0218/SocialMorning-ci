#!/usr/bin/env node
// Checks that every animation in app/ and src/ is driven by the one useReducedMotion() hook.
/**
 * M31 T081 (design-pulse2 §System: "Reduce Motion: no rise, no breathe, fades only"). One hook,
 * `src/ui/kit/useReducedMotion.ts`, asks the phone; nothing else may. Two rules on `app/` and `src/`
 * (tests and the hook's own file excluded; comment lines ignored):
 *   1. `AccessibilityInfo.isReduceMotionEnabled` is called nowhere but the hook.
 *   2. A file that starts an animation (`Animated.timing(`, `Animated.spring(`, `Animated.decay(`,
 *      `withTiming(`, `withSpring(`, `withRepeat(`, `withDecay(`, `withDelay(`, `LayoutAnimation.`,
 *      a reanimated `ZoomIn`/`SlideIn…`/`BounceIn…` entering or exiting animation) imports `useReducedMotion`.
 *      (A file that only draws a value another file animated starts nothing.)
 *
 *   node scripts/reduce-motion-check.mjs     exit 1 and the file:line of each break
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HOOK_FILE = 'src/ui/kit/useReducedMotion.ts';

const DIRECT = /AccessibilityInfo\s*\.\s*isReduceMotionEnabled/;
const STARTS = /\b(?:Animated\s*\.\s*(?:timing|spring|decay)|withTiming|withSpring|withRepeat|withDecay|withDelay|LayoutAnimation\s*\.\s*(?:configureNext|create|easeInEaseOut|spring|linear))\s*[(.]|\b(?:Zoom|Slide|Bounce|Flip|Rotate|Stretch|LightSpeed|Pinwheel|Roll)(?:In|Out)\w*\s*[.(]/;
const USES_HOOK = /\buseReducedMotion\b/;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== '__tests__') walk(p, out); continue; }
    if (/\.(tsx?|jsx?)$/.test(p) && !/\.test\.[tj]sx?$/.test(p)) out.push(p);
  }
  return out;
}

const isComment = (line) => { const t = line.trim(); return t.startsWith('*') || t.startsWith('//') || t.startsWith('/*'); };

/** Pure: `files` is [{ file, text }] (paths relative to apps/mobile). Returns the findings, each a string. */
export function findMotion(files) {
  const out = [];
  for (const { file, text } of files) {
    if (file === HOOK_FILE || /(^|\/)__tests__\//.test(file) || /\.test\.[tj]sx?$/.test(file)) continue;
    const lines = text.split('\n');
    const importsHook = lines.some((l) => !isComment(l) && /\bimport\b/.test(l) && USES_HOOK.test(l)) || lines.some((l, i) => !isComment(l) && USES_HOOK.test(l) && /from\s+['"]/.test(lines.slice(i, i + 4).join(' ')));
    lines.forEach((line, i) => {
      if (isComment(line)) return;
      if (DIRECT.test(line)) out.push(`${file}:${i + 1} asks AccessibilityInfo.isReduceMotionEnabled itself (use useReducedMotion from @/ui/kit/useReducedMotion)`);
      else if (STARTS.test(line) && !importsHook) out.push(`${file}:${i + 1} starts an animation but the file does not use useReducedMotion`);
    });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = ['app', 'src'].flatMap((r) => walk(path.join(MOBILE, r))).map((f) => ({ file: path.relative(MOBILE, f).split(path.sep).join('/'), text: readFileSync(f, 'utf8') }));
  const findings = findMotion(files);
  if (findings.length) {
    console.error(`reduce-motion-check: ${findings.length} animation(s) not driven by useReducedMotion`);
    for (const f of findings) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`reduce-motion-check: ok — ${files.length} files, every animation file uses useReducedMotion, no direct AccessibilityInfo`);
}
