// Tests that every phone-API contract accepts its own example, survives a JSON round-trip, and rejects broken answers.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CONTRACTS, validate, type Schema } from '../src/index';

const names = Object.keys(CONTRACTS) as (keyof typeof CONTRACTS)[];
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

test('there are contracts to test', () => {
  assert.ok(names.length >= 10, `only ${names.length} contracts`);
});

for (const name of names) {
  const c = CONTRACTS[name];

  test(`${name}: the example is valid, and parse → serialise → parse gives the same value, still valid`, () => {
    assert.deepEqual(validate(c.schema, c.example), []);
    const once = JSON.parse(JSON.stringify(c.example)) as unknown;
    const twice = JSON.parse(JSON.stringify(once)) as unknown;
    assert.deepEqual(twice, once);
    assert.deepEqual(once, c.example, 'the example is plain JSON (nothing lost on the wire)');
    assert.deepEqual(validate(c.schema, twice), []);
  });

  test(`${name}: the schema itself is plain JSON (a JSON Schema tool can take it)`, () => {
    assert.deepEqual(clone(c.schema), c.schema);
    assert.ok(c.path.startsWith('/v1/') && (c.method === 'GET' || c.method === 'POST'));
  });

  test(`${name}: every required top-level field is enforced, and a wrong type or a non-object is refused`, () => {
    const required = c.schema.required ?? [];
    assert.ok(required.length > 0, 'a contract pins at least one field');
    for (const k of required) {
      const without = clone(c.example) as Record<string, unknown>;
      delete without[k];
      assert.ok(validate(c.schema, without).some((e) => e.includes(`$.${k}: missing`)), `missing ${k} must be refused`);

      const undef = { ...(clone(c.example) as Record<string, unknown>), [k]: undefined };
      assert.ok(validate(c.schema, undef).length > 0, `${k}: undefined counts as missing`);

      const wrong = { ...(clone(c.example) as Record<string, unknown>), [k]: Symbol.for('x') as unknown };
      assert.ok(validate(c.schema, wrong).length > 0, `${k}: a non-JSON value must be refused`);
    }
    for (const bad of [null, 42, 'text', [], true]) assert.ok(validate(c.schema, bad).length > 0, JSON.stringify(bad));
  });

  test(`${name}: extra fields are allowed (the schemas are open)`, () => {
    const extra = { ...(clone(c.example) as Record<string, unknown>), somethingNew: 1 };
    assert.deepEqual(validate(c.schema, extra), []);
  });
}

test('type mismatches name the path', () => {
  const bad = clone(CONTRACTS.social.example) as { comments: { id: unknown; replies: { createdAt: unknown }[] }[]; episode: { id: unknown } };
  bad.episode.id = 7;
  bad.comments[0]!.id = null;
  bad.comments[0]!.replies[0]!.createdAt = 0;
  const errors = validate(CONTRACTS.social.schema, bad);
  assert.ok(errors.some((e) => e.startsWith('$.episode.id: expected string')), errors.join('\n'));
  assert.ok(errors.some((e) => e.startsWith('$.comments[0].id: expected string, got null')), errors.join('\n'));
  assert.ok(errors.some((e) => e.startsWith('$.comments[0].replies[0].createdAt')), 'recursive $ref reaches nested replies');
});

test('enums, anyOf and nullable fields', () => {
  const notif = clone(CONTRACTS.notifications.example) as { items: { kind: unknown }[] };
  notif.items[0]!.kind = 'poke';
  assert.ok(validate(CONTRACTS.notifications.schema, notif).some((e) => e.includes('is not one of')));

  const social = clone(CONTRACTS.social.example) as { heat: unknown };
  social.heat = { available: false };
  assert.deepEqual(validate(CONTRACTS.social.schema, social), [], 'heat: the unavailable branch');
  social.heat = { available: true };
  assert.ok(validate(CONTRACTS.social.schema, social).some((e) => e.includes('matches none of anyOf')), 'available:true needs buckets');
  social.heat = { available: 'yes', buckets: [] };
  assert.ok(validate(CONTRACTS.social.schema, social).length > 0);

  const content = clone(CONTRACTS.content.example) as { items: { summary: unknown }[] };
  content.items[0]!.summary = null;
  assert.deepEqual(validate(CONTRACTS.content.schema, content), [], 'summary may be null');
  content.items[0]!.summary = 5;
  assert.ok(validate(CONTRACTS.content.schema, content).length > 0);
});

test('integers are not floats, numbers are finite, arrays are not objects', () => {
  const s: Schema = { type: 'object', properties: { n: { type: 'integer' }, x: { type: 'number' }, a: { type: 'array', items: { type: 'string' }, minItems: 1 } } };
  assert.deepEqual(validate(s, { n: 1, x: 1.5, a: ['a'] }), []);
  assert.ok(validate(s, { n: 1.5 }).length > 0);
  assert.ok(validate(s, { x: Infinity }).length > 0);
  assert.ok(validate(s, { x: NaN }).length > 0);
  assert.ok(validate(s, { a: [] }).some((e) => e.includes('fewer than 1')));
  assert.ok(validate(s, { a: [1] }).length > 0);
  assert.ok(validate(s, [{ n: 1 }]).length > 0, 'an array is not an object');
});

test('additionalProperties: false refuses unknown keys, a schema types them, $ref errors are reported', () => {
  const closed: Schema = { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false };
  assert.deepEqual(validate(closed, { a: 'x' }), []);
  assert.deepEqual(validate(closed, { a: 'x', b: 1 }), ['$.b: not allowed']);
  const typed: Schema = { type: 'object', additionalProperties: { type: 'string' } };
  assert.deepEqual(validate(typed, { a: 'x' }), []);
  assert.ok(validate(typed, { a: 1 }).length > 0);
  assert.deepEqual(validate({ $ref: '#/$defs/nope' }, 1), ['$: unknown $ref #/$defs/nope']);
  assert.deepEqual(validate({ $ref: 'elsewhere' }, 1), ['$: unknown $ref elsewhere']);
});
