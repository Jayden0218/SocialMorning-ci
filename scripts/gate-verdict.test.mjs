// M27 G-DV4: the commit script's verdict is the worst run, not the gate's alone.  Run: node --test scripts/gate-verdict.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verdict } from './gate-verdict.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

test('gate success + ddb-api failure is RED', () => assert.equal(verdict(fixture('gate-runs-ddb-red')), 'RED'));
test('every run green or skipped is GREEN', () => assert.equal(verdict(fixture('gate-runs-green')), 'GREEN'));
test('a run still going is PENDING, never GREEN', () => assert.equal(verdict(fixture('gate-runs-pending')), 'PENDING'));
test('a red run beats a pending one', () => assert.equal(verdict([...fixture('gate-runs-pending'), { name: 'e2e', status: 'completed', conclusion: 'failure' }]), 'RED'));
test('no runs at all is NONE (nothing to trust)', () => assert.equal(verdict([]), 'NONE'));
// CI speed (2026-10-31): studio-e2e, infra and codeql run only when their paths change, so a commit has no run at all for them.
// A workflow with no run is not waited for; but `gate` runs on every push, so a verdict without it is PENDING, never GREEN
// (another workflow may finish before GitHub has even listed the gate's run).
test('a path-filtered workflow with no run is not waited for', () =>
  assert.equal(verdict([{ name: 'gate', status: 'completed', conclusion: 'success' }]), 'GREEN'));
test('no gate run yet is PENDING, even when every listed run is green', () =>
  assert.equal(verdict([{ name: 'android-compile', status: 'completed', conclusion: 'success' }]), 'PENDING'));
test('a red run without the gate run is still RED', () =>
  assert.equal(verdict([{ name: 'studio-e2e', status: 'completed', conclusion: 'failure' }]), 'RED'));
