// Tests the app settings check: good values kept and cleaned, bad ones refused, missing ones at today's defaults.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_DEFAULTS, CONFIG_KEYS, SHORTCUT_IDS, checkConfig, isConfigKey, orderedVisible, readConfig } from '../src/app-config.ts';

const ok = <T>(c: { ok: boolean; value?: T; error?: string }): T => { assert.equal(c.ok, true, c.error); return c.value as T; };
const no = (c: { ok: boolean; error?: string }, re: RegExp): void => { assert.equal(c.ok, false); assert.match(c.error!, re); };

test('the defaults are today\'s app', () => {
  assert.deepEqual(CONFIG_DEFAULTS.shortcuts.map((s) => s.id), [...SHORTCUT_IDS]);
  assert.equal(SHORTCUT_IDS.length, 8);
  assert.deepEqual(CONFIG_DEFAULTS.genres, []);
  assert.deepEqual(CONFIG_DEFAULTS.listSizes, { discoverCategories: 8, searchCategories: 4, searchHints: 5 });
  assert.deepEqual(CONFIG_DEFAULTS.ratePrompt, { enabled: true, delayMs: 1500, reaskAfterDays: null, storeUrls: {} });
  assert.deepEqual(readConfig(undefined), CONFIG_DEFAULTS);
  assert.deepEqual(readConfig([1, 2]), CONFIG_DEFAULTS);
  assert.ok(isConfigKey('genres'));
  assert.ok(!isConfigKey('nope'));
  assert.equal(CONFIG_KEYS.length, 6);
});

test('shortcuts: order, label, hidden; unknown, repeated or badly typed refused', () => {
  assert.deepEqual(ok(checkConfig('shortcuts', [{ id: 'plaza', label: '  Square ', hidden: false, extra: 1 }, { id: 'queue', label: '   ', hidden: true }])),
    [{ id: 'plaza', label: 'Square', hidden: false }, { id: 'queue', hidden: true }]);
  no(checkConfig('shortcuts', 'x'), /list of at most 8/);
  no(checkConfig('shortcuts', new Array(9).fill({ id: 'queue' })), /at most 8/);
  no(checkConfig('shortcuts', [5]), /must be an object/);
  no(checkConfig('shortcuts', [[]]), /must be an object/);
  no(checkConfig('shortcuts', [{ id: 'inbox' }]), /Unknown shortcut inbox/);
  no(checkConfig('shortcuts', [{ id: 'queue' }, { id: 'queue' }]), /listed twice/);
  no(checkConfig('shortcuts', [{ id: 'queue', label: 3 }]), /must be text/);
  no(checkConfig('shortcuts', [{ id: 'queue', label: 'x'.repeat(25) }]), /at most 24/);
  no(checkConfig('shortcuts', [{ id: 'queue', hidden: 'yes' }]), /true or false/);
  assert.deepEqual(ok(checkConfig('shortcuts', [{ id: 'queue', label: null }])), [{ id: 'queue' }]);
});

test('genres: rename, hide, order; ids are whole numbers', () => {
  assert.deepEqual(ok(checkConfig('genres', [{ id: 1303, name: 'Funny' }, { id: 1321, hidden: true }])), [{ id: 1303, name: 'Funny' }, { id: 1321, hidden: true }]);
  no(checkConfig('genres', [{ id: 1.5 }]), /whole number/);
  no(checkConfig('genres', [{ id: 0 }]), /whole number/);
  no(checkConfig('genres', [{ id: 1303 }, { id: 1303 }]), /listed twice/);
  no(checkConfig('genres', [{ id: 1303, name: 'x'.repeat(33) }]), /at most 32/);
});

test('section titles: only known sections; blank means the default', () => {
  assert.deepEqual(ok(checkConfig('sectionTitles', { 'For You': ' Made for you ', 'New arrivals': '' })), { 'For You': 'Made for you' });
  no(checkConfig('sectionTitles', { Nope: 'x' }), /Unknown section/);
  no(checkConfig('sectionTitles', []), /must be an object/);
  no(checkConfig('sectionTitles', null), /must be an object/);
});

test('list sizes: known keys inside their range; missing keys keep the default', () => {
  assert.deepEqual(ok(checkConfig('listSizes', { discoverCategories: 12 })), { discoverCategories: 12, searchCategories: 4, searchHints: 5 });
  no(checkConfig('listSizes', { discoverCategories: 20 }), /from 0 to 19/);
  no(checkConfig('listSizes', { searchHints: 0 }), /from 1 to 10/);
  no(checkConfig('listSizes', { other: 1 }), /Unknown list size/);
});

test('rate prompt: switch, delay, ask again, https store links only', () => {
  assert.deepEqual(ok(checkConfig('ratePrompt', {})), CONFIG_DEFAULTS.ratePrompt);
  assert.deepEqual(ok(checkConfig('ratePrompt', { enabled: false, delayMs: 0, reaskAfterDays: 30, storeUrls: { ios: 'https://apps.apple.com/app/id1', android: '' } })),
    { enabled: false, delayMs: 0, reaskAfterDays: 30, storeUrls: { ios: 'https://apps.apple.com/app/id1' } });
  assert.equal(ok<{ reaskAfterDays: number | null }>(checkConfig('ratePrompt', { reaskAfterDays: null })).reaskAfterDays, null);
  no(checkConfig('ratePrompt', { storeUrls: { android: 'javascript:alert(1)' } }), /https/);
  no(checkConfig('ratePrompt', { storeUrls: 'x' }), /Store links/);
  no(checkConfig('ratePrompt', { delayMs: 60_001 }), /delay/);
  no(checkConfig('ratePrompt', { reaskAfterDays: 0 }), /Ask again/);
});

test('search hints: trimmed words, no blanks, no repeats, at most 10', () => {
  assert.deepEqual(ok(checkConfig('searchHints', [' history ', '', 'jazz'])), ['history', 'jazz']);
  no(checkConfig('searchHints', ['a', 'a']), /twice/);
  no(checkConfig('searchHints', new Array(11).fill('a')), /at most 10/);
});

test('readConfig keeps each good key and puts the default back for a bad one', () => {
  const c = readConfig({ shortcuts: [{ id: 'plaza' }], genres: 'broken', searchHints: ['jazz'] });
  assert.deepEqual(c.shortcuts, [{ id: 'plaza' }]);
  assert.deepEqual(c.genres, []);
  assert.deepEqual(c.searchHints, ['jazz']);
  assert.deepEqual(c.ratePrompt, CONFIG_DEFAULTS.ratePrompt);
});

test('orderedVisible: saved order first, unknown ids dropped, unnamed ids after, hidden left out', () => {
  const ids = ['a', 'b', 'c', 'd'] as const;
  const out = orderedVisible<string, { id: string; hidden?: boolean }>(ids, [{ id: 'c' }, { id: 'zz' }, { id: 'a', hidden: true }]);
  assert.deepEqual(out.map((x) => x.id), ['c', 'b', 'd']);
  assert.deepEqual(out[0]!.row, { id: 'c' });
  assert.equal(out[1]!.row, undefined);
});
