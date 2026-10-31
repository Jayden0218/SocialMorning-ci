// M30 T060: the environments table is filled from fixtures; an unreachable address does not crash; staging never shows US$0.00 by itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTable, replaceBlock, costCell, fetchHealth, latestDeployment, preview, START, END, FREE_COST } from './environments-status.mjs';

const deployments = [
  { environment: 'dev', sha: 'aaaaaaa1111', state: 'success', createdAt: '2026-10-27T01:00:00Z' },
  { environment: 'dev', sha: 'bbbbbbb2222', state: 'success', createdAt: '2026-10-27T02:30:00Z' },
  { environment: 'dev', sha: 'ccccccc3333', state: 'failure', createdAt: '2026-10-27T03:00:00Z' },
  { environment: 'production', sha: 'ddddddd4444', state: 'success', createdAt: '2026-10-20T10:00:00Z' },
];
const rowOf = (t, env) => t.split('\n').find((l) => l.startsWith(`| ${env} |`));

test('rows are filled from deployments and health bodies', () => {
  const t = renderTable({ deployments, health: { qa: { url: 'https://qa.example/health', body: { env: 'qa', commit: 'eeeeeee5555', builtAt: '2026-10-26T08:00:00Z' } } } });
  assert.match(rowOf(t, 'dev'), /\| bbbbbbb \| 2026-10-27 02:30 UTC \| US\$0\.00 — free ledger \|/, 'newest successful deployment wins, failure ignored');
  assert.match(rowOf(t, 'qa'), /https:\/\/qa\.example\/health \| eeeeeee \| 2026-10-26 08:00 UTC/);
  assert.match(rowOf(t, 'prod'), /\| ddddddd \| 2026-10-20 10:00 UTC \|/, '"production" deployments fill prod');
  assert.match(rowOf(t, 'staging'), /\| — \| — \| not started \|/);
  assert.equal(latestDeployment(deployments, 'staging'), undefined);
});

test('an unreachable address shows unreachable and does not throw', async () => {
  const h = await fetchHealth('https://x.invalid/health', 50, () => Promise.reject(new Error('boom')));
  assert.deepEqual(h, { url: 'https://x.invalid/health', error: 'Error' });
  const t = renderTable({ health: { dev: h } });
  assert.match(rowOf(t, 'dev'), /https:\/\/x\.invalid\/health — unreachable/);
  const bad = await fetchHealth('https://x/health', 50, async () => ({ ok: false, status: 503 }));
  assert.equal(bad.error, 'HTTP 503');
});

test('cost rule: dev and qa are free; staging and prod are never US$0.00 unless a number is passed in', () => {
  assert.equal(costCell('dev'), FREE_COST);
  assert.equal(costCell('qa', { qa: 99 }), FREE_COST);
  assert.equal(costCell('staging'), 'not started');
  assert.equal(costCell('staging', { staging: 0 }), 'US$0.00', 'a number passed from the AWS budget is shown as given');
  assert.equal(costCell('prod', { prod: 12.3456 }), 'US$12.35');
  assert.ok(!rowOf(renderTable({}), 'staging').includes('US$0.00'));
  assert.ok(!rowOf(renderTable({}), 'prod').includes('US$0.00'));
});

test('only the block between the markers changes', () => {
  const page = `# Top\n\n${START}\nold\n${END}\n\n## Rest\nkeep\n`;
  const next = replaceBlock(page, renderTable({ deployments }));
  assert.ok(next.startsWith(`# Top\n\n${START}\n| Env |`) && next.endsWith(`${END}\n\n## Rest\nkeep\n`));
  assert.match(preview(page, next), /^- old\n\+ \| Env/);
  assert.throws(() => replaceBlock('no markers', 'x'), /not found/);
});

// M30 review fix 3: GitHub Deployments from Vercel are named "Production – qa-api" and from AWS `stg` / `sm`; the same mapper promote-check uses.
test('latestDeployment: Vercel-style and AWS names fill their rows; Preview and studio-only deployments do not', () => {
  const sha = (c) => c.repeat(40);
  const deployments = [
    { environment: 'Production – qa-api', sha: sha('a'), state: 'success', createdAt: '2026-10-27T10:00:00Z' },
    { environment: 'Production – dev-api', sha: sha('b'), state: 'success', createdAt: '2026-10-27T09:00:00Z' },
    { environment: 'Preview – qa-api', sha: sha('c'), state: 'success', createdAt: '2026-10-27T11:00:00Z' },
    { environment: 'Production – qa-studio', sha: sha('d'), state: 'success', createdAt: '2026-10-27T12:00:00Z' },
    { environment: 'stg', sha: sha('e'), state: 'success', createdAt: '2026-10-27T08:00:00Z' },
    { environment: 'sm', sha: sha('f'), state: 'success', createdAt: '2026-10-27T07:00:00Z' },
  ];
  assert.equal(latestDeployment(deployments, 'qa').sha, sha('a'), 'the API production deployment, not the newer Preview or studio one');
  assert.equal(latestDeployment(deployments, 'dev').sha, sha('b'));
  assert.equal(latestDeployment(deployments, 'staging').sha, sha('e'));
  assert.equal(latestDeployment(deployments, 'prod').sha, sha('f'));
  const table = renderTable({ deployments });
  assert.match(table, /\| qa \|.*\| aaaaaaa \|/);
  assert.match(table, /\| staging \|.*\| eeeeeee \|/);
});
