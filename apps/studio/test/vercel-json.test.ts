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

  it('refuses an origin that is not a bare https origin', () => {
    expect(() => generate('http://x.example')).toThrow();
    expect(() => generate('https://x.example/')).toThrow();
  });
});
