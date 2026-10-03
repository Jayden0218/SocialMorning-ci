// Imports or exports your subscription list as an OPML file.
/**
 * Import or export the subscription list as OPML (M10) — the file every podcast app
 * reads, so moving to or from SocialNet keeps your shows. Export is text you can share;
 * import reads each `<outline … xmlUrl="…">`.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

export function toOpml(shows: readonly { feedUrl: string; title?: string }[], now: Date): string {
  const lines = shows.map((s) => `    <outline type="rss" text="${esc(s.title ?? s.feedUrl)}" title="${esc(s.title ?? s.feedUrl)}" xmlUrl="${esc(s.feedUrl)}" />`);
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<opml version="2.0">', `  <head><title>SocialNet subscriptions</title><dateCreated>${now.toUTCString()}</dateCreated></head>`, '  <body>', ...lines, '  </body>', '</opml>', ''].join('\n');
}

/** Every distinct http(s) feed URL in the text, in order. */
export function fromOpml(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/<outline\b[^>]*\bxmlUrl\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    const url = unesc((m[2] ?? m[3] ?? '').trim());
    if (/^https?:\/\/\S+$/i.test(url) && !out.includes(url)) out.push(url);
  }
  return out;
}
