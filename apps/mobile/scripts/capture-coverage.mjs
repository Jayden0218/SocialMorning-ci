#!/usr/bin/env node
// Fails when a screen or popup in the code has no capture entry, or an entry points at code that is gone.
/**
 * M27 (specs/031-m29-screen-capture, FR-003, guard G-M27-1…4). Reads the code (capture-sites.mjs)
 * and the inventory (m27/inventory/*.json) and checks:
 *
 *   1. every site in the code is covered by some entry           → "NEW: <file>:<line> <kind> <key>"
 *   2. every covered id is a site that still exists               → "STALE: entry <name> covers <id>"
 *   3. every entry is well formed (name unique and file-safe, known kind / account / status, a
 *      reason when not CAPTURE, steps when CAPTURE, a design that exists)
 *   4. entries that are NOT_CAPTURABLE or EXCLUDED stay under 5 % of all entries (SC-003)
 *
 *   node scripts/capture-coverage.mjs          → exit 1 with the list on any finding
 *   node scripts/capture-coverage.mjs --list   → counts by kind and status
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { MOBILE, scan } from './capture-sites.mjs';

export const KINDS = ['screen', 'sheet', 'menu', 'dialog', 'toast', 'permission', 'empty', 'loading', 'error', 'offline', 'variant', 'system'];
export const ACCOUNTS = ['visitor', 'new', 'listener', 'host', 'plus', 'moderator', 'suspended'];
export const STATUSES = ['CAPTURE', 'NOT_CAPTURABLE', 'EXCLUDED'];
const STEP_KEYS = ['open', 'tap', 'type', 'see', 'key', 'fault', 'back'];
export const MAX_NON_CAPTURE = 0.05;

export function loadInventory(dir = path.join(MOBILE, 'm27', 'inventory')) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .flatMap((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')).map((e) => ({ ...e, _file: f })));
}

export function check(sites, entries, designs) {
  const problems = [];
  const byId = new Map(sites.map((s) => [s.id, s]));
  const covered = new Set();
  const names = new Map();
  for (const e of entries) {
    const where = `entry ${e.name ?? '(no name)'} [${e._file}]`;
    if (!e.name || !/^[a-z0-9]+(-[a-z0-9]+)*(--[a-z0-9]+(-[a-z0-9]+)*)*$/.test(e.name)) problems.push(`BAD: ${where} has no file-safe name`);
    if (names.has(e.name)) problems.push(`BAD: ${where} repeats the name of ${names.get(e.name)}`);
    names.set(e.name, e._file);
    if (!KINDS.includes(e.kind)) problems.push(`BAD: ${where} kind "${e.kind}"`);
    if (!e.area) problems.push(`BAD: ${where} has no area`);
    if (!ACCOUNTS.includes(e.as)) problems.push(`BAD: ${where} account "${e.as}"`);
    if (!STATUSES.includes(e.status)) problems.push(`BAD: ${where} status "${e.status}"`);
    if (e.status !== 'CAPTURE' && !e.reason) problems.push(`BAD: ${where} is ${e.status} with no reason`);
    if (e.status === 'CAPTURE') {
      if (!Array.isArray(e.steps) || e.steps.length === 0) problems.push(`BAD: ${where} is CAPTURE with no steps`);
      for (const s of e.steps ?? []) if (!STEP_KEYS.some((k) => k in s)) problems.push(`BAD: ${where} has a step with no known key: ${JSON.stringify(s)}`);
    }
    if (e.design && !designs.includes(e.design)) problems.push(`BAD: ${where} design "${e.design}" is not in designs.json`);
    // A variant of a screen (signed out, step 2 of a flow) may have no code site of its own: covers may be [].
    if (!Array.isArray(e.covers)) problems.push(`BAD: ${where} has no covers list`);
    for (const id of e.covers ?? []) {
      covered.add(id);
      if (!byId.has(id)) problems.push(`STALE: ${where} covers ${id}, which is not in the code`);
    }
  }
  for (const s of sites) if (!covered.has(s.id)) problems.push(`NEW: ${s.file}:${s.line} ${s.kind} "${s.key}" has no capture entry`);
  const non = entries.filter((e) => e.status !== 'CAPTURE').length;
  if (entries.length > 0 && non / entries.length > MAX_NON_CAPTURE) {
    problems.push(`RATIO: ${non} of ${entries.length} entries (${((100 * non) / entries.length).toFixed(1)} %) are NOT_CAPTURABLE or EXCLUDED; the limit is ${MAX_NON_CAPTURE * 100} %`);
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const sites = scan();
  const entries = loadInventory();
  const designs = JSON.parse(readFileSync(path.join(MOBILE, 'm17', 'designs.json'), 'utf8'));
  if (process.argv.includes('--list')) {
    const c = {};
    for (const e of entries) { c[e.kind] ??= {}; c[e.kind][e.status] = (c[e.kind][e.status] ?? 0) + 1; }
    console.log(JSON.stringify({ entries: entries.length, sites: sites.length, byKind: c }, null, 1));
    process.exit(0);
  }
  const problems = check(sites, entries, designs);
  if (problems.length) {
    console.error(`capture-coverage: ${problems.length} problem(s)\n` + problems.map((p) => '  ' + p).join('\n'));
    process.exit(1);
  }
  console.log(`capture-coverage: ok — ${sites.length} sites covered by ${entries.length} entries`);
}
