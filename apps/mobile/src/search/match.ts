/**
 * Owner, 2026-10-01: on the Search page the part of a name that matches what was typed is
 * drawn in the accent colour. This splits a name into plain and matching pieces — every
 * occurrence, any case, the name's own letters kept as written.
 */
export type Segment = { text: string; match: boolean };

export function splitMatch(text: string, term: string): Segment[] {
  const t = term.trim();
  if (text === '') return [];
  if (t === '') return [{ text, match: false }];
  const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  const out: Segment[] = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ text: text.slice(at, i), match: false });
    out.push({ text: m[0], match: true });
    at = i + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), match: false });
  return out;
}
