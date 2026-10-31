#!/usr/bin/env node
// M30 T060: fill the four-row table of docs/environments.md (between the env-rows markers) from GitHub Deployments and health bodies.
// Pure functions are exported; the CLI at the bottom does the I/O. No token is read, printed or needed: the deployments come from a
// JSON file (e.g. `gh api repos/OWNER/REPO/deployments` + statuses, reduced to {environment, sha, state, createdAt}).
//
//   node scripts/environments-status.mjs --deployments d.json [--health dev=https://..,qa=https://..] [--cost staging=12.34]
//        [--page docs/environments.md] [--write]
// Health addresses can also come from HEALTH_DEV, HEALTH_QA, HEALTH_STAGING, HEALTH_PROD. Without --write it prints a preview.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeEnvironment } from './promote-check.mjs';

export const START = '<!-- env-rows:start -->';
export const END = '<!-- env-rows:end -->';
export const ENVS = [
  { env: 'dev', branch: '`dev` (default)', address: 'project exists, not deployed (`dev-api`, `dev-studio` on Vercel Hobby)' },
  { env: 'qa', branch: '`qa`', address: 'project exists, not deployed (`qa-api`, `qa-studio` on Vercel Hobby)' },
  { env: 'staging', branch: '`staging`', address: 'not created yet — needs the paid AWS account (O-4 of `docs/runbooks/m26-aws-setup.md`)' },
  { env: 'prod', branch: '`main`', address: 'https://socialmorning-api.vercel.app (Postgres build, until the M26 cutover)' },
];
export const FREE_COST = 'US$0.00 — free ledger';

/**
 * The newest successful deployment for an env, or undefined. Names are mapped by promote-check's `normalizeEnvironment` (the same
 * rule that decides a promotion): `Production – qa-api`, `stg`, `sm`, `production` ...; a Preview or studio-only deployment does not count.
 */
export function latestDeployment(deployments, env) {
  return (deployments ?? [])
    .filter((d) => d.state === 'success' && (() => { const n = normalizeEnvironment(d.environment); return n.env === env && n.role !== 'studio'; })())
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

/** The cost cell. Only dev and qa are free by construction; staging/prod show a number only when one is passed in from the AWS budget. */
export function costCell(env, costs = {}) {
  if (env === 'dev' || env === 'qa') return FREE_COST;
  const n = costs[env];
  if (typeof n === 'number' && Number.isFinite(n)) return `US$${n.toFixed(2)}`;
  return env === 'staging' ? 'not started' : 'see `docs/STATUS.md`';
}

const when = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—');

/**
 * health[env] is either {url, body} (answered; body = {env, commit, builtAt}), {url, error} (did not), or absent (no address given).
 * Returns the markdown table (header, rule, four rows), no trailing newline.
 */
export function renderTable({ deployments = [], health = {}, costs = {} } = {}) {
  const out = ['| Env | Branch | Address | Commit | Deployed | Cost this month |', '|---|---|---|---|---|---|'];
  for (const e of ENVS) {
    const dep = latestDeployment(deployments, e.env);
    const h = health[e.env];
    let address = e.address, commit = '—', deployed = '—';
    if (dep) { commit = String(dep.sha).slice(0, 7); deployed = when(dep.createdAt); }
    if (h) {
      if (h.error || !h.body) address = `${h.url} — unreachable`;
      else {
        address = h.url;
        if (h.body.commit) commit = String(h.body.commit).slice(0, 7);
        if (!dep && h.body.builtAt) deployed = when(h.body.builtAt);
      }
    }
    out.push(`| ${e.env} | ${e.branch} | ${address} | ${commit} | ${deployed} | ${costCell(e.env, costs)} |`);
  }
  return out.join('\n');
}

/** Replace the text between the markers; throws when a marker is missing. Everything else is returned untouched. */
export function replaceBlock(page, table) {
  const a = page.indexOf(START), b = page.indexOf(END);
  if (a < 0 || b < a) throw new Error(`${START} / ${END} not found in the page`);
  return page.slice(0, a + START.length) + '\n' + table + '\n' + page.slice(b);
}

/** A diff-style preview: lines only in the old block as "- ", only in the new as "+ ". */
export function preview(oldPage, newPage) {
  const block = (p) => p.slice(p.indexOf(START) + START.length, p.indexOf(END)).split('\n').filter(Boolean);
  const o = block(oldPage), n = block(newPage);
  return [...o.filter((l) => !n.includes(l)).map((l) => `- ${l}`), ...n.filter((l) => !o.includes(l)).map((l) => `+ ${l}`)].join('\n') || '(no change)';
}

/** GET {url}/health-style address with a timeout; never throws. */
export async function fetchHealth(url, ms = 5000, fetchFn = fetch) {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(ms) });
    if (!res.ok) return { url, error: `HTTP ${res.status}` };
    return { url, body: await res.json() };
  } catch (e) {
    return { url, error: e?.name ?? 'error' };
  }
}

function parseArgs(argv) {
  const o = { write: false, page: 'docs/environments.md', health: {}, cost: {} };
  const pairs = (s, f) => s.split(',').filter(Boolean).forEach((p) => { const i = p.indexOf('='); f(p.slice(0, i), p.slice(i + 1)); });
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') o.write = true;
    else if (a === '--deployments') o.deployments = argv[++i];
    else if (a === '--page') o.page = argv[++i];
    else if (a === '--health') pairs(argv[++i], (k, v) => { o.health[k] = v; });
    else if (a === '--cost') pairs(argv[++i], (k, v) => { o.cost[k] = Number(v); });
    else throw new Error(`unknown argument ${a}`);
  }
  for (const e of ENVS) { const v = process.env[`HEALTH_${e.env.toUpperCase()}`]; if (v && !o.health[e.env]) o.health[e.env] = v; }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const deployments = o.deployments ? JSON.parse(readFileSync(o.deployments, 'utf8')) : [];
  const health = {};
  await Promise.all(Object.entries(o.health).map(async ([env, url]) => { health[env] = await fetchHealth(url); }));
  const old = readFileSync(o.page, 'utf8');
  const next = replaceBlock(old, renderTable({ deployments, health, costs: o.cost }));
  if (o.write) { writeFileSync(o.page, next); console.log(`wrote ${o.page}`); } else console.log(preview(old, next));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
