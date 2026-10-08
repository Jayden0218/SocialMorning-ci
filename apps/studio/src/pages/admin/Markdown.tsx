// Draws the content pages' Markdown subset as React text — never as HTML — for the Content preview.
import type { ReactNode } from 'react';
import { parseMarkdown, type MdInline } from '@socialmorning/social-core';

/**
 * M25 A8 guard (content sanitising): every run is a React text child, so React escapes it; there
 * is no `dangerouslySetInnerHTML` anywhere in this file. A `<script>` in a body shows as the
 * characters `<script>`. Links are only the `https://` ones the parser kept.
 */
function Runs({ v }: { v: readonly MdInline[] }): ReactNode {
  return v.map((x, i) => {
    if (x.t === 'bold') return <strong key={i}>{x.v}</strong>;
    if (x.t === 'link') return <a key={i} href={x.href} target="_blank" rel="noopener noreferrer">{x.v}</a>;
    return <span key={i}>{x.v}</span>;
  });
}

export function MarkdownView({ source, label }: { source: string; label: string }) {
  return (
    <div className="md-preview" aria-label={label} role="region">
      {parseMarkdown(source).map((b, i) => {
        if (b.t === 'h2') return <h3 key={i}><Runs v={b.v} /></h3>;
        if (b.t === 'h3') return <h4 key={i}><Runs v={b.v} /></h4>;
        if (b.t === 'p') return <p key={i}><Runs v={b.v} /></p>;
        const items = b.items.map((it, j) => <li key={j}><Runs v={it} /></li>);
        return b.t === 'ol' ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
      })}
    </div>
  );
}
