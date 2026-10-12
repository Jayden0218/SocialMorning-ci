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
