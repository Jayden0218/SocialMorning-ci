/** quickstart A9: a report hides locally at once and is delivered once; blocks likewise; refill at sign-in. */
import { createMemoryStores } from '../src/storage/memory';
import { createSafety } from '../src/safety/hidden';
import { ApiError, type ApiClient } from '../src/social/api';
import { hiddenKey } from '@socialmorning/social-core';

type Calls = { report: unknown[][]; block: string[]; unblock: string[]; hidden: number };

function setup(opts: { fail?: 'network' | 'validation' | 'none'; viewer?: string | null } = {}) {
  const stores = createMemoryStores((x) => x);
  const viewer = opts.viewer === undefined ? 'me' : opts.viewer;
  if (viewer !== null) stores.auth.set({ listenerId: viewer, displayName: 'Me', email: 'me@x' }, 1);
  const calls: Calls = { report: [], block: [], unblock: [], hidden: 0 };
  let mode = opts.fail ?? 'none';
  const api = {
    report: async (...a: unknown[]) => {
      calls.report.push(a);
      if (mode === 'network') throw new ApiError('network', 'no', 0);
      if (mode === 'validation') throw new ApiError('validation', 'own', 422, { reason: 'own' });
      return { id: 'r1', duplicate: calls.report.length > 1 };
    },
    block: async (id: string) => { calls.block.push(id); if (mode === 'network') throw new ApiError('network', 'no', 0); },
    unblock: async (id: string) => { calls.unblock.push(id); if (mode === 'network') throw new ApiError('network', 'no', 0); },
    hidden: async () => { calls.hidden++; return { reported: [{ kind: 'clip' as const, id: 'k1' }], blocked: [{ id: 'z', displayName: 'Zed' }], hiddenFeeds: ['https://f/hidden.xml'] }; },
  } as unknown as ApiClient;
  let changes = 0;
  const safety = createSafety({ api, stores, now: () => 100, viewerId: () => stores.auth.get()?.listenerId, ownerId: () => 'owner', onChange: () => { changes++; } });
  return { stores, calls, safety, setMode: (m: typeof mode) => { mode = m; }, changes: () => changes };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

it('report: hidden at once (before any network), delivered once, marked delivered; a repeat is one row', async () => {
  const t = setup();
  expect(t.safety.report('comment', 'c1', 'them', 'spam', 'note')).toBe('hidden');
  expect(t.safety.isHidden('comment', 'c1')).toBe(true);
  expect(t.safety.sets().hidden.has(hiddenKey('comment', 'c1'))).toBe(true);
  expect(t.stores.hidden.pending()).toHaveLength(1);
  await tick(); await tick();
  expect(t.calls.report).toEqual([['comment', 'c1', 'spam', 'note']]);
  expect(t.stores.hidden.pending()).toHaveLength(0);
  expect(t.safety.report('comment', 'c1', 'them', 'hate')).toBe('hidden');
  await tick(); await tick();
  expect(t.calls.report).toHaveLength(1);
  expect(t.stores.hidden.all()).toHaveLength(1);
  expect(t.changes()).toBeGreaterThan(0);
});

it('report: signed out → sign_in; own content → own; nothing stored either way', () => {
  const out = setup({ viewer: null });
  expect(out.safety.report('comment', 'c1', 'them', 'spam')).toBe('sign_in');
  expect(out.stores.hidden.all()).toEqual([]);
  const me = setup();
  expect(me.safety.report('comment', 'c1', 'me', 'spam')).toBe('own');
  expect(me.safety.report('profile', 'me', null, 'spam')).toBe('own');
  expect(me.stores.hidden.all()).toEqual([]);
  expect(me.safety.report('show', 'https://f/x.xml', null, 'illegal')).toBe('hidden');
  expect(me.safety.hiddenFeeds().has('https://f/x.xml')).toBe(true);
});

it('offline: the row stays pending and the hide holds; deliver() later sends it once (FR-005)', async () => {
  const t = setup({ fail: 'network' });
  t.safety.report('clip', 'k1', 'them', 'spam');
  await tick(); await tick();
  expect(t.calls.report).toHaveLength(1);
  expect(t.stores.hidden.pending()).toHaveLength(1);
  expect(t.safety.isHidden('clip', 'k1')).toBe(true);
  t.setMode('none');
  await t.safety.deliver();
  expect(t.calls.report).toHaveLength(2);
  expect(t.stores.hidden.pending()).toHaveLength(0);
  await t.safety.deliver();
  expect(t.calls.report).toHaveLength(2);
});

it('a report the server refuses for good is not resent; the local hide stands', async () => {
  const t = setup({ fail: 'validation' });
  t.safety.report('comment', 'c1', 'them', 'spam');
  await tick(); await tick();
  expect(t.stores.hidden.pending()).toHaveLength(0);
  expect(t.safety.isHidden('comment', 'c1')).toBe(true);
});

it('block: local at once, delivered; self and the owner refused; unblock before delivery forgets, after delivery sends the unblock', async () => {
  const t = setup();
  expect(t.safety.block('me')).toBe('self');
  expect(t.safety.block('owner')).toBe('owner');
  expect(t.safety.block('them', 'Them')).toBe('blocked');
  expect(t.safety.isBlocked('them')).toBe(true);
  expect(t.safety.sets().blocked.has('them')).toBe(true);
  await tick(); await tick();
  expect(t.calls.block).toEqual(['them']);
  expect(t.stores.blocks.pending()).toHaveLength(0);
  t.safety.unblock('them');
  expect(t.safety.isBlocked('them')).toBe(false);
  await tick(); await tick();
  expect(t.calls.unblock).toEqual(['them']);
  expect(t.stores.blocks.all()).toEqual([]);
  // undelivered block, then unblock: nothing reaches the server
  t.setMode('network');
  t.safety.block('other');
  await tick(); await tick();
  t.safety.unblock('other');
  expect(t.stores.blocks.all()).toEqual([]);
  t.setMode('none');
  await t.safety.deliver();
  expect(t.calls.unblock).toEqual(['them']);
  expect(t.safety.blockedList()).toEqual([]);
});

it('refill at sign-in replaces delivered rows with the server\'s, keeps pending ones, stores hidden feeds, then delivers', async () => {
  const t = setup({ fail: 'network' });
  t.safety.report('comment', 'c9', 'them', 'spam'); // stays pending (offline)
  await tick(); await tick();
  t.setMode('none');
  await t.safety.refill();
  expect(t.calls.hidden).toBe(1);
  expect(t.safety.isHidden('clip', 'k1')).toBe(true);
  expect(t.safety.isHidden('comment', 'c9')).toBe(true);
  expect(t.safety.isBlocked('z')).toBe(true);
  expect(t.safety.hiddenFeeds().has('https://f/hidden.xml')).toBe(true);
  expect(t.stores.hidden.pending()).toHaveLength(0);
  expect(t.calls.report).toHaveLength(2);
});
