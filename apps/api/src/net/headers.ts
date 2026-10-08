// Security headers on every API response: CSP, no framing, no sniffing, a strict referrer.
/**
 * M25 S9 (audit #12). The API host sent only HSTS (Vercel's). Now every response carries:
 *  - Content-Security-Policy: JSON and everything else `default-src 'none'; frame-ancestors 'none'`;
 *    the server's own HTML pages (/mod, /privacy, /e, /c, /l, /gift, /show) may show https images
 *    and audio, use their inline <style>, and post forms to themselves — no script at all;
 *  - X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: no-referrer.
 * A route that set its own CSP keeps it.
 */
import type { MiddlewareHandler } from 'hono';

export const JSON_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";
export const HTML_CSP = "default-src 'none'; img-src 'self' https: data:; media-src 'self' https:; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  const apply = (h: Headers) => {
    const html = (h.get('content-type') ?? '').toLowerCase().startsWith('text/html');
    if (!h.has('content-security-policy')) h.set('content-security-policy', html ? HTML_CSP : JSON_CSP);
    h.set('x-frame-options', 'DENY');
    h.set('x-content-type-options', 'nosniff');
    h.set('referrer-policy', 'no-referrer');
  };
  try {
    apply(c.res.headers);
  } catch {
    // A response whose headers are immutable (one passed through from a fetch) is copied first.
    const copy = new Response(c.res.body, { status: c.res.status, statusText: c.res.statusText, headers: new Headers(c.res.headers) });
    apply(copy.headers);
    c.res = copy;
  }
};
