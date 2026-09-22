/**
 * GET /c/:id — the shareable clip link (research R1). An HTML page, no player, no media:
 * the episode's title, the caption, the author, and "Open in app" on the app's own
 * scheme. On a phone where the domain verified as an Android App Link this page is never
 * seen — the OS opens the app straight away. GET /.well-known/assetlinks.json is the
 * statement that verification needs; empty until ASSETLINKS_SHA256 is set (T031).
 */
import { Hono } from 'hono';
import type { AuthEnv } from '../auth/session.ts';
import { getClip } from '../db/repos/clips.ts';

export const APP_PACKAGE = 'app.socialmorning.mobile';

export const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
export const mmss = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — SocialMorning</title>
<style>body{font:17px/1.5 system-ui,sans-serif;margin:0;padding:24px;max-width:560px;color:#111}a.btn{display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:24px;text-decoration:none;margin:16px 8px 0 0}.muted{color:#666}</style></head><body>${body}</body></html>`;
}

export function assetLinks(sha256: string | undefined): unknown[] {
  const fps = (sha256 ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (fps.length === 0) return [];
  return [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: APP_PACKAGE, sha256_cert_fingerprints: fps } }];
}

export function createClipPages(env: { assetLinksSha256?: string }) {
  const pages = new Hono<AuthEnv>();

  pages.get('/.well-known/assetlinks.json', (c) => c.json(assetLinks(env.assetLinksSha256)));

  pages.get('/c/:id', async (c) => {
    const id = c.req.param('id');
    const found = /^[0-9a-f-]{36}$/i.test(id) ? await getClip(c.get('db'), id) : undefined;
    if (!found) {
      return c.html(page('Clip not found', `<h1>No such clip</h1><p class="muted">The link may be wrong, or the clip was never sent.</p>`), 404);
    }
    const { clip, episode } = found;
    const open = `socialmorning://clip/${encodeURIComponent(clip.id)}`;
    const show = episode.show_title ? `<p class="muted">${esc(episode.show_title)}</p>` : '';
    if (clip.deleted_at !== null || clip.removed_at != null) {
      return c.html(page(episode.title, `<h1>This clip was removed</h1><h2>${esc(episode.title)}</h2>${show}<p class="muted">The episode is still there.</p><a class="btn" href="${open}">Open the episode in the app</a><p class="muted">No app yet? <a href="/get">Get SocialMorning for Android</a>.</p>`));
    }
    const by = clip.author_name ? `<p class="muted">Clipped by ${esc(clip.author_name)} · ${mmss(clip.start_ms)}–${mmss(clip.end_ms)}</p>` : `<p class="muted">${mmss(clip.start_ms)}–${mmss(clip.end_ms)}</p>`;
    return c.html(page(episode.title, `<h1>${esc(episode.title)}</h1>${show}${clip.caption ? `<blockquote>${esc(clip.caption)}</blockquote>` : ''}${by}<a class="btn" href="${open}">Open in app</a><p class="muted">No app yet? <a href="/get">Get SocialMorning for Android</a> — the clip plays from the publisher's own audio; nothing is hosted here.</p>`));
  });

  return pages;
}
