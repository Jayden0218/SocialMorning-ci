// @vitest-environment node
// Checks every Studio page is served with the M23 security headers (CSP, nosniff, Referrer-Policy).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('security headers (T040)', () => {
  it('every Studio page sends a CSP that forbids framing and foreign scripts, plus nosniff and Referrer-Policy', () => {
    const cfg = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
    const all = cfg.headers.find((h) => h.source === '/(.*)');
    const get = (k: string) => all?.headers.find((h) => h.key === k)?.value ?? '';
    const csp = get('Content-Security-Policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' https://vercel.com");
    expect(get('X-Content-Type-Options')).toBe('nosniff');
    expect(get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
});
