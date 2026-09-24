#!/usr/bin/env node
/**
 * M6 FR-022: every interactive element has a name a screen reader can speak — either an
 * `accessibilityLabel` or text children that ARE the name. This is a grep, not a
 * renderer: it catches the common miss (an icon-only Pressable, an unlabelled control)
 * and prints the file and line. The device row (J5) is the real evidence.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOTS = ['app', 'src'];
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
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // Skip comments: a doc comment may name a component it is explaining.
    const bare = lines[i].trim();
    if (bare.startsWith('*') || bare.startsWith('//') || bare.startsWith('/*')) continue;
    const open = /<(Pressable|TouchableOpacity|TouchableHighlight|Switch|TextInput|Link)\b/.exec(lines[i]);
    if (!open) continue;
    const tag = open[1];
    // Read to the element's own close: `</Tag>`, or a `/>` that closes THIS tag (a `/>`
    // on an inner element, e.g. <View style={styles.art} />, is not the end).
    let block = '';
    let depth = 0;
    for (let j = i; j < Math.min(lines.length, i + 60); j++) {
      const line = lines[j];
      block += line + '\n';
      if (j === i && /\/>/.test(line.slice(open.index))) break;
      depth += (line.match(new RegExp(`<${tag}\\b`, 'g')) ?? []).length;
      depth -= (line.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
      if (j > i && depth <= 0) break;
      if (j > i && /^\s*\/>/.test(line) && depth <= 1) { /* the opening tag closed on its own line */ }
    }
    const named = /accessibilityLabel\s*=/.test(block) || /aria-label/.test(block);
    const hasText = /<Text[\s>]/.test(block) || /\{`[^`]+`\}/.test(block) || /<Link\b[^>]*>[^<]+</.test(block);
    if (!named && !hasText) findings.push(`${file}:${i + 1} <${tag}> has no accessibilityLabel and no text child`);
    // M6 (FR-022, found on the phone in J5): a bare <Link> renders a View that TalkBack
    // reads as plain text — focusable but with no role and clickable="false". It needs a
    // role of its own; `asChild` hands the role to the child instead.
    if (tag === 'Link' && !/asChild/.test(block) && !/accessibilityRole\s*=/.test(block)) {
      findings.push(`${file}:${i + 1} <Link> has no accessibilityRole (a screen reader hears text, not a link)`);
    }
  }
}

if (findings.length > 0) {
  console.error(`a11y audit: ${findings.length} interactive element(s) with no name`);
  for (const f of findings) console.error('  ' + f);
  process.exit(1);
}
console.log(`a11y audit: every interactive element in ${files.length} files has a name`);
