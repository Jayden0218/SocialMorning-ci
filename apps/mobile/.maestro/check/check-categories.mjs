#!/usr/bin/env node
// Fails when one Discover visit asks the server for too many category pages (the 035 C2 back-off), read from api.log.
/**
 * 036 T021 (C2). api.log is the test server's request log (apps/api/scripts/request-log.ts): `<iso> -> <id> <METHOD> <path>` on arrival and
 * `<iso> <- <id> <status> <ms>ms` when the answer is ready. r25-categories.yaml brackets each Discover visit with two marker requests:
 * `GET /__e2e/removed` opens a visit, the next `GET /__e2e/code` closes it. Inside a visit the `GET /v1/categories/<id>` arrivals are counted
 * (`GET /v1/categories` alone, other methods and other paths are not). Allowed: MAX (8) plus one for each of those requests that failed
 * (status 500 or more, or no finish line). More fails with a line naming the count. A category id asked in an earlier visit and asked again in a
 * later one fails as well (035 finishing: with the catalogue off in CI every request fails, so the count rule alone can never go red; the 2-minute
 * back-off and the 10-minute keep mean the second visit, seconds later, asks for none of them); a log with no complete visit fails too: nothing read.
 *
 * Usage: node check-categories.mjs <api.log> [max]   → one line per visit, exit 1 on a finding, 2 on bad usage.
 */
import { existsSync, readFileSync } from 'node:fs';

const file = process.argv[2];
const MAX = Number(process.argv[3] ?? 8);
if (!file || !existsSync(file) || !Number.isFinite(MAX)) { console.error('usage: check-categories.mjs <api.log> [max]'); process.exit(2); }

const arrival = /^\S+ -> (\S+) (\S+) (\S+)$/;
const finish = /^\S+ <- (\S+) (\d{3})\b/;
const lines = readFileSync(file, 'utf8').split('\n');
const status = new Map();
for (const l of lines) { const m = finish.exec(l); if (m) status.set(m[1], Number(m[2])); }

const visits = [];
let open;
const seenIn = new Map(); // category id -> the visit (1-based) that first asked for it
for (const l of lines) {
  const m = arrival.exec(l);
  if (!m) continue;
  const [, rid, method, p] = m;
  if (method === 'GET' && p === '/__e2e/removed') { open = { asked: 0, failed: 0 }; continue; }
  if (method === 'GET' && p === '/__e2e/code') { if (open) visits.push(open); open = undefined; continue; }
  if (open && method === 'GET' && p.startsWith('/v1/categories/')) {
    open.asked += 1;
    const cid = p.slice('/v1/categories/'.length).split('?')[0];
    const n = visits.length + 1;
    if (!seenIn.has(cid)) seenIn.set(cid, n);
    else if (seenIn.get(cid) < n) (open.again ??= new Set()).add(cid);
    const s = status.get(rid);
    if (s === undefined || s >= 500) open.failed += 1;
  }
}

let bad = 0;
visits.forEach((v, i) => {
  const allowed = MAX + v.failed;
  const repeats = v.again ? [...v.again] : [];
  const ok = v.asked <= allowed && repeats.length === 0;
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} visit ${i + 1}: ${v.asked} GET /v1/categories/ requests, ${v.failed} failed, at most ${allowed} allowed${repeats.length ? `; asked AGAIN after an earlier visit (back-off / keep broken): ${repeats.join(', ')}` : ''}`);
});
if (visits.length === 0) { console.log('FAIL no complete Discover visit in the log (no GET /__e2e/removed … GET /__e2e/code pair): nothing was checked'); process.exit(1); }
process.exit(bad ? 1 : 0);
