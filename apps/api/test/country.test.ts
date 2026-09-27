/**
 * M10b US7 — "IP location": the country from the sign-in request, two letters only, shown on
 * the profile to everyone. Guard G-I1 (country only, never more) — the break that turns it
 * red: in `src/db/repos/country.ts` `countryOf`, return the header unchecked (a city or an
 * IP would then be stored and shown).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countryOf } from '../src/db/repos/country.ts';
import { freshDb, signUp } from './harness.ts';

test('G-I1: only a two-letter country is kept; anything else is ignored', () => {
  assert.equal(countryOf('my'), 'MY');
  assert.equal(countryOf(' SG '), 'SG');
  assert.equal(countryOf('Kuala Lumpur'), undefined);
  assert.equal(countryOf('203.0.113.9'), undefined);
  assert.equal(countryOf('XX'), undefined);
  assert.equal(countryOf(undefined), undefined);
});

test('signing in records the country; every viewer sees it on the profile', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Al');
  const b = await signUp(t, 'b@example.com', 'Bo');
  const r = await t.call('POST', '/v1/auth/sign-in', { email: 'a@example.com', password: 'correct horse' }, undefined, { 'x-vercel-ip-country': 'MY', 'x-vercel-ip-city': 'Kuala%20Lumpur' });
  assert.equal(r.status, 200);
  const seen = (await (await t.call('GET', `/v1/listeners/${a.id}`, undefined, b.token)).json()) as { profile: { country?: string } };
  assert.equal(seen.profile.country, 'MY');
  const row = await t.q<{ country: string }>('SELECT country FROM listeners WHERE id = $1', [a.id]);
  assert.equal(row[0]?.country, 'MY', 'the city header is never stored');
  // A later sign-in with no usable header leaves the country as it was.
  await t.call('POST', '/v1/auth/sign-in', { email: 'a@example.com', password: 'correct horse' });
  assert.equal((await t.q<{ country: string }>('SELECT country FROM listeners WHERE id = $1', [a.id]))[0]?.country, 'MY');
  await t.close();
});
