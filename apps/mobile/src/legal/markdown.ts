/**
 * The small slice of Markdown the legal texts use, turned into blocks a screen can draw:
 * headings (`#`–`####`), paragraphs, `- ` items, `> ` notes, tables, and `**bold**`.
 * Nothing else is needed, so no Markdown library is pulled in for it.
 */
export type Span = { text: string; bold: boolean };
export type BlockKind = 'title' | 'heading' | 'subheading' | 'paragraph' | 'item' | 'note' | 'row';
export type Block = { kind: BlockKind; spans: Span[] };

/** `a **b** c` → a, b (bold), c. Backticks are dropped: they mark a name, not code, here. */
export function spans(line: string): Span[] {
  return line
    .replace(/`/g, '')
    .split('**')
    .map((text, i) => ({ text, bold: i % 2 === 1 }))
    .filter((s) => s.text.length > 0);
}

const cells = (line: string): string[] => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function parseLegal(md: string): Block[] {
  const blocks: Block[] = [];
  let tableHeader = true;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) tableHeader = true;
    if (line.length === 0) continue;
    if (line.startsWith('|')) {
      if (/^\|[\s|:-]+\|$/.test(line)) continue; // the |---| rule under a header
      const row = cells(line).filter((c) => c.length > 0);
      if (row.length > 0) blocks.push({ kind: 'row', spans: [{ text: row.join(' · '), bold: tableHeader }] });
      tableHeader = false;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const [, hashes = '', rest = ''] = h;
      const kind: BlockKind = hashes.length === 1 ? 'title' : hashes.length === 2 ? 'heading' : 'subheading';
      blocks.push({ kind, spans: spans(rest) });
      continue;
    }
    if (line.startsWith('> ')) { blocks.push({ kind: 'note', spans: spans(line.slice(2)) }); continue; }
    if (line.startsWith('- ')) { blocks.push({ kind: 'item', spans: spans(line.slice(2)) }); continue; }
    blocks.push({ kind: 'paragraph', spans: spans(line) });
  }
  return blocks;
}

/** The document's own `# ` line, used as the screen's title. */
export function titleOf(md: string): string {
  const t = parseLegal(md).find((b) => b.kind === 'title');
  return t ? t.spans.map((s) => s.text).join('') : '';
}
