// A small Markdown subset turned into plain data, so the Studio and the phone draw it as text — never as HTML.
/**
 * M25 A8 (`content_pages`): Academy articles and Help answers are written by an admin in a
 * Markdown subset — `## heading` / `### heading`, paragraphs, `- ` and `1. ` lists, `**bold**`
 * and `[words](https://…)` links. This parser returns blocks of text runs; the Studio
 * (`apps/studio/src/pages/admin/Markdown.tsx`) and the phone (`apps/mobile/src/ui/content/Markdown.tsx`)
 * draw those runs as text nodes. Nothing here, and nothing there, ever treats the text as HTML:
 * a `<script>` in a body is drawn as the eight characters `<script>`.
 *
 * A link is kept only when it starts with `https://`; any other `[words](target)` stays as text.
 */

export type MdInline = { t: 'text'; v: string } | { t: 'bold'; v: string } | { t: 'link'; v: string; href: string };
export type MdBlock = { t: 'h2' | 'h3' | 'p'; v: MdInline[] } | { t: 'ul' | 'ol'; items: MdInline[][] };
export type MdSection = { heading: string; blocks: MdBlock[] };

export const SAFE_LINK = /^https:\/\/[^\s<>"'`]+$/;
const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(s: string): MdInline[] {
  const out: MdInline[] = [];
  let last = 0;
  for (const m of s.matchAll(INLINE)) {
    const at = m.index!;
    if (at > last) out.push({ t: 'text', v: s.slice(last, at) });
    if (m[1] !== undefined) out.push({ t: 'bold', v: m[1] });
    else if (SAFE_LINK.test(m[3]!)) out.push({ t: 'link', v: m[2]!, href: m[3]! });
    else out.push({ t: 'text', v: m[0] });
    last = at + m[0].length;
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
  return out;
}

export function parseMarkdown(src: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  let open: { t: 'ul' | 'ol'; items: MdInline[][] } | null = null;
  const endPara = () => {
    if (para.length > 0) blocks.push({ t: 'p', v: parseInline(para.join(' ')) });
    para = [];
  };
  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    const item = /^(?:([-*])|\d{1,3}[.)])\s+(.+)$/.exec(line);
    if (line === '' || h || item) endPara();
    if (line === '') { open = null; continue; }
    if (h) {
      open = null;
      blocks.push({ t: h[1]!.length === 3 ? 'h3' : 'h2', v: parseInline(h[2]!) });
    } else if (item) {
      const kind = item[1] ? 'ul' : 'ol';
      if (open === null || open.t !== kind) { open = { t: kind, items: [] }; blocks.push(open); }
      open.items.push(parseInline(item[2]!));
    } else {
      open = null;
      para.push(line);
    }
  }
  endPara();
  return blocks;
}

/** The words of a run list, without marks — for a screen-reader label or a list's preview line. */
export const plainText = (v: readonly MdInline[]): string => v.map((x) => x.v).join('');

/** Split at each `##` heading: an Academy article's numbered sections. Text before the first heading has heading ''. */
export function sectionsOf(blocks: readonly MdBlock[]): MdSection[] {
  const out: MdSection[] = [];
  for (const b of blocks) {
    if (b.t === 'h2') out.push({ heading: plainText(b.v), blocks: [] });
    else {
      if (out.length === 0) out.push({ heading: '', blocks: [] });
      out[out.length - 1]!.blocks.push(b);
    }
  }
  return out;
}
