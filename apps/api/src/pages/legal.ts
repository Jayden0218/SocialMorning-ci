// Plain web pages: privacy, terms, community rules, and where to get the app.
/** M6 (FR-027, FR-028): /privacy, /rules and /get. M25 SB: /privacy and /terms are the app's own documents (legal-texts.ts). */
import { Hono } from 'hono';
import type { AuthEnv } from '../auth/session.ts';
import { esc, page } from './clip.ts';
import { LEGAL_TEXT } from './legal-texts.ts';

export const RELEASES_URL = 'https://github.com/Jayden0218/SocialMorning-ci/releases/latest';

export const legal = new Hono<AuthEnv>();

/**
 * M25 SB (audit #17, #18): /privacy and /terms show the SAME documents the app shows
 * (`legal-texts.ts`, written by apps/mobile/scripts/legal-sync.mjs from docs/legal/*.md), so the
 * web cannot say something the app does not — the old hand-written page said deletion was
 * immediate (it waits 15 days) and that nothing was hosted (Studio audio, voice and pictures are
 * on Vercel Blob).
 */
legal.get('/privacy', (c) => c.html(page('Privacy Policy', `${legalHtml(LEGAL_TEXT.privacy)}${contact(c.get('safety').appealsEmail)}`)));
legal.get('/terms', (c) => c.html(page('Terms of Service', `${legalHtml(LEGAL_TEXT.agreement)}${contact(c.get('safety').appealsEmail)}`)));

function contact(appeals: string | undefined): string {
  return `<h2>Contact</h2><p>${appeals ? `Questions, appeals, data requests: <a href="mailto:${esc(appeals)}">${esc(appeals)}</a>.` : 'Contact the owner through the app.'}</p>
<p class="muted"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/rules">Community rules</a> · <a href="/get">Get the app</a></p>`;
}

/**
 * The legal documents' small Markdown — headings, paragraphs, `- ` items, `> ` notes, tables and
 * `**bold**` (the same subset the app draws, apps/mobile/src/legal/markdown.ts) — as HTML. Every
 * piece of text is escaped first; the only markup is what this function writes.
 */
export function legalHtml(md: string): string {
  const out: string[] = [];
  let list = false;
  let rows: string[][] = [];
  const inline = (t: string) => esc(t.replace(/`/g, '')).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*\*/g, '');
  const flushTable = () => {
    if (rows.length === 0) return;
    const [head, ...body] = rows;
    out.push(`<table><tr>${head!.map((c) => `<th>${inline(c)}</th>`).join('')}</tr>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table>`);
    rows = [];
  };
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const item = /^[-*] /.test(line);
    if (!item && list) { out.push('</ul>'); list = false; }
    if (!line.startsWith('|')) flushTable();
    if (line.length === 0) continue;
    if (line.startsWith('|')) {
      if (!/^\|[\s|:-]+\|$/.test(line)) rows.push(line.replace(/^\||\|$/g, '').split('|').map((x) => x.trim()));
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { const n = h[1]!.length; out.push(`<h${n}>${inline(h[2]!)}</h${n}>`); continue; }
    if (item) {
      if (!list) { out.push('<ul>'); list = true; }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    if (line.startsWith('>')) { out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); continue; }
    out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  flushTable();
  return out.join('\n');
}

legal.get('/rules', (c) => {
  const appeals = c.get('safety').appealsEmail;
  return c.html(page('Community rules', `<h1>Community rules</h1>
<p>Comments and clips sit next to other people's listening. Keep them worth reading.</p>
<h2>Not allowed</h2>
<ul>
<li><b>Spam</b> — repeated, off-topic or promotional posts.</li>
<li><b>Harassment</b> — targeting a person to hurt or scare them.</li>
<li><b>Hate</b> — attacking people for who they are.</li>
<li><b>Sexual content</b> involving minors, or non-consensual sexual content.</li>
<li><b>Violence</b> — threats or glorification.</li>
<li><b>Illegal content</b>.</li>
</ul>
<h2>What happens</h2>
<p>Anyone can <b>report</b> a comment, clip, profile or show — it is hidden for them at once. Anyone can <b>block</b> a listener — nothing that listener writes reaches them again. The owner reviews every report and may dismiss it, remove the content, hide a show from discovery, or suspend the account.</p>
<h2>Appeals</h2>
<p>${appeals ? `If your content was removed or your account suspended and you think that was wrong, write to <a href="mailto:${esc(appeals)}">${esc(appeals)}</a>.` : 'Write to the owner through the app.'}</p>
<p class="muted"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/get">Get the app</a></p>`));
});

legal.get('/get', (c) => {
  const sha = c.get('safety').releaseSha256;
  return c.html(page('Get SocialNet', `<h1>Get SocialNet for Android</h1>
<p>A podcast player with a social layer: comments pinned to the moment, a reaction curve on the scrubber, clips as ranges, and a Discover page that has something to open on day one.</p>
<a class="btn" href="${RELEASES_URL}">Download the latest build</a>
<p class="muted">The build is a signed APK on GitHub Releases. Android will ask you to allow installs from your browser the first time.${sha ? ` SHA-256 of the current build: <code>${esc(sha)}</code>` : ''}</p>
<p><a href="/privacy">Privacy</a> · <a href="/rules">Community rules</a></p>`));
});
