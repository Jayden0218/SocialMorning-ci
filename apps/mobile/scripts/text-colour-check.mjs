#!/usr/bin/env node
// Checks that every text element has a colour set, not the default black.
/**
 * M7's black-on-black defect, the class token-check cannot see (2026-09-27).
 *
 * React Native's default text colour is black, and this app is black. token-check
 * catches a style that sets a font size with no colour — but a `<Text>` with NO style
 * at all sets nothing, so there is nothing for it to find. The Tailwind pass found about
 * 15 of them ("Sign in to follow people.", the clip page messages, the stats labels) plus
 * text inputs whose typed text was black.
 *
 * Rule: every `<Text>` and `<TextInput>` names a token colour in its `className`
 * (`text-text`, `text-muted`, `text-accent`…). The one exception is a `<Text>` nested in
 * a `<Text>` that has one: React Native passes the colour down. A `<TextInput>` never
 * inherits. This parses the TSX with the TypeScript compiler, so multi-line tags,
 * ternaries and class constants are read, not guessed at.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOTS = ['app', 'src'];
const TOKENS = [...readFileSync(path.join('src', 'design', 'tokens.ts'), 'utf8')
  .split('} as const')[0]
  .matchAll(/^\s+([a-zA-Z]+):/gm)].map((m) => m[1]);
const COLOURED = new RegExp(`(?:^|[\\s'"\`])text-(?:${TOKENS.join('|')})(?=[\\s'"\`]|$)`);

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p); continue; }
    if (/\.tsx$/.test(p)) files.push(p);
  }
};
for (const r of ROOTS) walk(r);

const findings = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  // Class-string constants declared in this file, and those imported from another .tsx
  // file under app/ or src/, resolved to their initialiser's text.
  const consts = new Map();
  const collect = (source) => {
    const visit = (n) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) consts.set(n.name.text, n.initializer.getText(source));
      ts.forEachChild(n, visit);
    };
    visit(source);
  };
  collect(sf);
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text;
    if (!spec.startsWith('.') && !spec.startsWith('@/')) continue;
    // `@/x` is the app's alias for src/x (tsconfig `paths`).
    const base = spec.startsWith('@/') ? path.join('src', spec.slice(2)) : path.join(path.dirname(file), spec);
    for (const ext of ['.tsx', '.ts']) {
      const p = base + ext;
      try {
        const src = readFileSync(p, 'utf8');
        collect(ts.createSourceFile(p, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
        break;
      } catch { /* try the next extension */ }
    }
  }

  // Does this className expression name a token colour, directly or through a constant?
  const names = (expr, seen = new Set()) => {
    const src = expr.getText(sf);
    if (COLOURED.test(src)) return true;
    for (const id of src.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
      if (seen.has(id) || !consts.has(id)) continue;
      seen.add(id);
      if (COLOURED.test(consts.get(id))) return true;
    }
    return false;
  };

  const tagOf = (n) => (ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : undefined);
  const colouredTag = (open) => {
    for (const a of open.attributes.properties) {
      if (!ts.isJsxAttribute(a) || a.name.getText(sf) !== 'className' || !a.initializer) continue;
      return names(a.initializer);
    }
    return false;
  };

  const visit = (n, inColouredText) => {
    const open = tagOf(n);
    let next = inColouredText;
    if (open) {
      const tag = open.tagName.getText(sf);
      if (tag === 'Text' || tag === 'TextInput') {
        const own = colouredTag(open);
        const ok = own || (tag === 'Text' && inColouredText);
        if (!ok) {
          const { line } = sf.getLineAndCharacterOfPosition(open.getStart(sf));
          findings.push(`${file}:${line + 1} <${tag}> names no token colour — it renders black on black`);
        }
        next = tag === 'Text' && ok;
      } else {
        next = false; // a colour does not pass through a View
      }
    }
    ts.forEachChild(n, (c) => visit(c, next));
  };
  visit(sf, false);
}

if (findings.length > 0) {
  console.error(`text colour check: ${findings.length} text node(s) with no colour`);
  for (const f of findings) console.error('  ' + f);
  process.exit(1);
}
console.log(`text colour check: every <Text> and <TextInput> in ${files.length} files names a token colour`);
