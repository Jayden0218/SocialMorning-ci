// @vitest-environment node
// M27 G-CL3: the generated vercel.json for the default origin is the committed one, byte for byte; a staging origin changes only /api.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = `${process.cwd()}/`; // vitest runs from apps/studio
const generate = (origin?: string): string =>
  execFileSync(process.execPath, ['scripts/vercel-json.mjs', '--stdout'], { cwd: root, encoding: 'utf8', env: { PATH: process.env['PATH'] ?? '', ...(origin ? { STUDIO_API_ORIGIN: origin } : {}) } });

describe('vercel.json generator', () => {
  it('the default output equals the committed vercel.json byte for byte (G-CL3)', () => {
    expect(generate()).toBe(readFileSync(`${root}vercel.json`, 'utf8'));
  });

  it('a staging origin changes the /api rewrite and nothing else', () => {
    const prod = JSON.parse(generate()) as { rewrites: { source: string; destination: string }[] };
    const stg = JSON.parse(generate('https://abc123.lambda-url.ap-southeast-1.on.aws')) as typeof prod;
    expect(stg.rewrites[0]!.destination).toBe('https://abc123.lambda-url.ap-southeast-1.on.aws/:path*');
    expect(JSON.stringify({ ...stg, rewrites: stg.rewrites.slice(1) })).toBe(JSON.stringify({ ...prod, rewrites: prod.rewrites.slice(1) }));
    expect(JSON.stringify(stg)).not.toContain('socialmorning-api.vercel.app');
  });

  // M30 (T016): the four environments — dev, qa and staging each point /api at their own address; prod is the default.
  it('dev, qa, staging and prod differ only in the /api rewrite destination (M30)', () => {
    type J = { rewrites: { source: string; destination: string }[] };
    const origins = {
      dev: 'https://dev-api.vercel.app',
      qa: 'https://qa-api.vercel.app',
      staging: 'https://abc123.lambda-url.ap-southeast-1.on.aws',
    } as const;
    const prod = JSON.parse(generate()) as J;
    expect(prod.rewrites[0]!.destination).toBe('https://socialmorning-api.vercel.app/:path*');
    for (const [name, origin] of Object.entries(origins)) {
      const out = JSON.parse(generate(origin)) as J;
      expect(out.rewrites[0]!.source, name).toBe('/api/:path*');
      expect(out.rewrites[0]!.destination, name).toBe(`${origin}/:path*`);
      expect(JSON.stringify({ ...out, rewrites: out.rewrites.slice(1) }), name).toBe(JSON.stringify({ ...prod, rewrites: prod.rewrites.slice(1) }));
      expect(JSON.stringify(out), name).not.toContain('socialmorning-api.vercel.app');
    }
    expect(new Set(Object.values(origins)).size).toBe(3);
  });

  it('refuses an origin that is not a bare https origin', () => {
    expect(() => generate('http://x.example')).toThrow();
    expect(() => generate('https://x.example/')).toThrow();
  });
});
