// R2 guard: every raw React Native <Text> / <TextInput> in app/ and src/ carries maxFontSizeMultiplier (or comes from a wrapper that sets it).
/**
 * At 200 % system text an uncapped Text grows without limit and breaks the layout (fontscale2 README). The kit `Type` caps at TYPE_CAP (1.3); a raw
 * `<Text` bypasses it. This scans app/ and src/ (.tsx; not src/ui/lib, the vendored kit; not tests) and fails for every `<Text` / `<TextInput` whose
 * opening tag has no `maxFontSizeMultiplier`, unless:
 *   - the file imports that name from a module other than 'react-native' whose source file contains `maxFontSizeMultiplier` (a shared wrapper with the default), or
 *   - the file is listed in apps/mobile/m31/uncapped-text-allow.json: { "allow": [{ "file": "src/x.tsx", "reason": "why" }] } (a justified exception).
 * `<Type` is the capped kit component and is never matched (`<Text` needs a whitespace, `>` or `/` right after the name).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');
const NAMES = ['Text', 'TextInput'] as const;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === 'node_modules' || e === '__tests__') continue;
      if (relative(ROOT, p) === join('src', 'ui', 'lib')) continue;
      walk(p, out);
    } else if (p.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(p)) out.push(p);
  }
  return out;
}

/** Comments blanked (same length, so line numbers hold). */
function blank(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\w'"`])\/\/[^\n]*/g, (m, pre: string) => pre + ' '.repeat(m.length - pre.length));
}

/** The opening tag starting at `from` (just after `<Name`): up to the `>` that closes it, braces and quotes respected. */
function openingTag(src: string, from: number): string {
  let depth = 0;
  let quote = '';
  for (let i = from; i < src.length; i++) {
    const ch = src[i]!;
    if (quote) { if (ch === quote && src[i - 1] !== '\\') quote = ''; continue; }
    if (depth > 0 && (ch === '"' || ch === "'" || ch === '`')) { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (depth === 0 && ch === '>') return src.slice(from, i);
    else if (depth === 0 && (ch === '"' || ch === "'")) quote = ch;
  }
  return src.slice(from);
}

function wrapperCaps(file: string, name: string, src: string): boolean {
  const re = new RegExp(`import\\s*(?:[\\w$]+\\s*,\\s*)?\\{[^}]*\\b${name}\\b(?:\\s+as\\s+\\w+)?[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`);
  const m = re.exec(src);
  if (!m || m[1] === 'react-native') return false;
  const spec = m[1]!;
  const base = spec.startsWith('@/') ? join(ROOT, 'src', spec.slice(2)) : spec.startsWith('.') ? join(file, '..', spec) : '';
  if (!base) return false;
  const hit = ['.tsx', '.ts', '/index.tsx', '/index.ts'].map((x) => base + x).find((p) => existsSync(p));
  return hit !== undefined && readFileSync(hit, 'utf8').includes('maxFontSizeMultiplier');
}

type Hit = { file: string; line: number; name: string };
function uncapped(): Hit[] {
  const allow = new Set((JSON.parse(readFileSync(join(ROOT, 'm31', 'uncapped-text-allow.json'), 'utf8')) as { allow: { file: string }[] }).allow.map((a) => a.file));
  const hits: Hit[] = [];
  for (const file of [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'src'))]) {
    const rel = relative(ROOT, file);
    if (allow.has(rel)) continue;
    const src = blank(readFileSync(file, 'utf8'));
    for (const name of NAMES) {
      const re = new RegExp(`<${name}(?=[\\s>/])`, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        if (openingTag(src, m.index + m[0].length).includes('maxFontSizeMultiplier')) continue;
        if (wrapperCaps(file, name, src)) continue;
        hits.push({ file: rel, line: src.slice(0, m.index).split('\n').length, name });
      }
    }
  }
  return hits;
}

describe('R2 every raw Text and TextInput is capped', () => {
  it('no <Text / <TextInput without maxFontSizeMultiplier (or a capping wrapper, or an allowlist entry)', () => {
    const hits = uncapped();
    const byFile = new Map<string, number>();
    for (const h of hits) byFile.set(h.file, (byFile.get(h.file) ?? 0) + 1);
    const report = [...byFile].sort().map(([f, n]) => `${n}\t${f}: lines ${hits.filter((h) => h.file === f).map((h) => `${h.line}${h.name === 'TextInput' ? '(input)' : ''}`).join(',')}`);
    expect(`${hits.length} uncapped in ${byFile.size} files\n${report.join('\n')}`).toBe('0 uncapped in 0 files\n');
  });
  it('the allowlist is well formed and every entry still names a file that exists', () => {
    const j = JSON.parse(readFileSync(join(ROOT, 'm31', 'uncapped-text-allow.json'), 'utf8')) as { allow: { file: string; reason: string }[] };
    for (const a of j.allow) {
      expect(existsSync(join(ROOT, a.file))).toBe(true);
      expect(a.reason.length).toBeGreaterThan(10);
    }
  });
});
