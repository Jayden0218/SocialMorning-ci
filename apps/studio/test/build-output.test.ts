// @vitest-environment node
// M30 (lane B): on dev, qa and staging the Studio build writes a Build Output API v3 folder whose /api route points at STUDIO_API_ORIGIN
// (a vercel.json rewrite destination is a literal, so a Git-connected project cannot change it any other way). Prod writes nothing.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = `${process.cwd()}/`; // vitest runs from apps/studio
let tmp = '';
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'studio-bo-'));
  mkdirSync(join(tmp, 'dist', 'assets'), { recursive: true });
  writeFileSync(join(tmp, 'dist', 'index.html'), '<!doctype html>');
  writeFileSync(join(tmp, 'dist', 'assets', 'a.js'), '1');
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const run = (env: { VITE_APP_ENV?: string; STUDIO_API_ORIGIN?: string }) =>
  spawnSync(process.execPath, ['scripts/build-output.mjs', '--dist', join(tmp, 'dist'), '--out', join(tmp, 'output')], {
    cwd: root, encoding: 'utf8', env: { PATH: process.env['PATH'] ?? '', ...(env as Record<string, string>) },
  });
type Route = { src?: string; dest?: string; headers?: Record<string, string>; continue?: boolean; handle?: string };
const config = (): { version: number; routes: Route[] } => JSON.parse(readFileSync(join(tmp, 'output', 'config.json'), 'utf8'));

describe('Studio Build Output API step (M30)', () => {
  it.each(['dev', 'qa', 'staging'])('%s without STUDIO_API_ORIGIN fails and names the variable', (appEnv) => {
    const r = run({ VITE_APP_ENV: appEnv });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('STUDIO_API_ORIGIN is required');
    expect(existsSync(join(tmp, 'output'))).toBe(false);
  });

  it.each(['dev', 'qa', 'staging'])('%s with STUDIO_API_ORIGIN: /api goes to that origin, the site is copied to static/', (appEnv) => {
    const origin = `https://${appEnv}-api.example.test`;
    const r = run({ VITE_APP_ENV: appEnv, STUDIO_API_ORIGIN: origin });
    expect(r.status, r.stderr).toBe(0);
    const c = config();
    expect(c.version).toBe(3);
    const api = c.routes.find((x) => x.src === '/api/(.*)' && x.dest);
    expect(api!.dest).toBe(`${origin}/$1`);
    expect(JSON.stringify(c)).not.toContain('socialmorning-api.vercel.app');
    expect(readFileSync(join(tmp, 'output', 'static', 'assets', 'a.js'), 'utf8')).toBe('1');
  });

  it('keeps the same headers as vercel.base.json, the SPA fallback after the filesystem, and the api no-cache header', () => {
    run({ VITE_APP_ENV: 'qa', STUDIO_API_ORIGIN: 'https://qa-api.example.test' });
    const c = config();
    const base = JSON.parse(readFileSync(`${root}vercel.base.json`, 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
    const all = base.headers.find((h) => h.source === '/(.*)')!.headers;
    const site = c.routes.find((x) => x.src === '/(.*)' && x.headers)!;
    expect(site.continue).toBe(true);
    expect(Object.entries(site.headers!)).toEqual(all.map((h) => [h.key, h.value]));
    expect(site.headers!['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(c.routes.find((x) => x.src === '/api/(.*)' && x.headers)!.headers).toEqual({ 'x-vercel-enable-rewrite-caching': '0' });
    const fs = c.routes.findIndex((x) => x.handle === 'filesystem');
    const spa = c.routes.findIndex((x) => x.src === '/(.*)' && x.dest === '/index.html');
    expect(fs).toBeGreaterThan(-1);
    expect(spa).toBeGreaterThan(fs);
  });

  it('refuses an origin that is not a bare https origin', () => {
    expect(run({ VITE_APP_ENV: 'dev', STUDIO_API_ORIGIN: 'http://x.example' }).status).not.toBe(0);
    expect(run({ VITE_APP_ENV: 'dev', STUDIO_API_ORIGIN: 'https://x.example/' }).status).not.toBe(0);
  });

  it.each([{}, { VITE_APP_ENV: 'prod' }, { VITE_APP_ENV: 'prod', STUDIO_API_ORIGIN: 'https://other.example' }])('prod (%j) writes nothing and succeeds', (env) => {
    const r = run(env);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(tmp, 'output'))).toBe(false);
  });

  it('an unknown VITE_APP_ENV is refused rather than built as prod', () => {
    expect(run({ VITE_APP_ENV: 'stage' }).status).not.toBe(0);
  });
});
