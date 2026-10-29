// F2a: a style ARRAY on a child of `<Link asChild>` crashes RN-web ("Failed to set an indexed property [0]
// on CSSStyleDeclaration") and blanks the tab. Merge into one object instead.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(f)) out.push(p);
  }
  return out;
}

/** For each `<Link … asChild …>` open tag, the source up to its matching `</Link>` (or the same line when self-contained). */
export function asChildBodies(src: string): string[] {
  const bodies: string[] = [];
  const re = /<Link\b[^>]*\basChild\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const end = src.indexOf('</Link>', m.index);
    bodies.push(src.slice(m.index + m[0].length, end < 0 ? m.index + m[0].length + 1500 : end));
  }
  return bodies;
}

describe('no style array under Link asChild', () => {
  it('the scanner sees an array (guard is not blind)', () => {
    const bad = `<Link href="/x" asChild><Pressable style={[{ a: 1 }, HALF]}>x</Pressable></Link>`;
    expect(asChildBodies(bad).some((b) => /style=\{\[/.test(b))).toBe(true);
  });
  it('no file in app/ or src/ has one', () => {
    const hits: string[] = [];
    for (const f of [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'src'))]) {
      for (const b of asChildBodies(readFileSync(f, 'utf8'))) if (/style=\{\[/.test(b)) hits.push(f.replace(ROOT, ''));
    }
    expect(hits).toEqual([]);
  });
});
