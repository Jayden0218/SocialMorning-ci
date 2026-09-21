/** quickstart A12: a clip made offline survives a restart and is sent ONCE with the same clientId. */
import { createClips } from '../src/graph/clips';
import type { ApiClient, Clip } from '../src/social/api';
import { ApiError } from '../src/social/api';
import { createMemoryPendingClipStore } from '../src/storage/memory';

const clipOf = (c: { clientId: string; startMs: number; endMs: number; caption: string }, episodeId: string): Clip =>
  ({ id: `id-${c.clientId}`, author: { id: 'me', displayName: 'Me' }, episodeId, startMs: c.startMs, endMs: c.endMs, caption: c.caption, createdAt: 'now', deleted: false });

function build(opts: { online?: boolean; signedIn?: boolean } = {}) {
  let online = opts.online ?? true;
  let signedIn = opts.signedIn ?? true;
  const posts: string[] = [];
  const sent: Clip[] = [];
  const pending = createMemoryPendingClipStore();
  const api = {
    registerEpisode: async () => { if (!online) throw new ApiError('network', 'no', 0); },
    postClip: async (episodeId: string, c: { clientId: string; startMs: number; endMs: number; caption: string }) => {
      if (!online) throw new ApiError('network', 'no', 0);
      if (c.endMs > 100_000) throw new ApiError('validation', 'past_end', 422);
      posts.push(c.clientId);
      return clipOf(c, episodeId);
    },
  } as unknown as ApiClient;
  let n = 0;
  const make = () => createClips({ api, pending, isSignedIn: () => signedIn, now: () => ++n, registration: () => ({ feedUrl: 'f', guid: 'g', title: 't', enclosureUrl: 'u' }), newClientId: () => `c${++n}`, onSent: (c) => { sent.push(c); } });
  return { make, pending, posts, sent, setOnline: (v: boolean) => { online = v; }, setSignedIn: (v: boolean) => { signedIn = v; } };
}

it('A12: offline → pending; "restart" (a new Clips over the same store) → online → one POST with the same clientId', async () => {
  const t = build({ online: false });
  const clips = t.make();
  const r = await clips.create('e', { startMs: 10_000, endMs: 40_000 }, '  hi  ');
  expect(r.kind).toBe('pending');
  expect(t.pending.list()).toHaveLength(1);
  expect(t.pending.list()[0]).toMatchObject({ caption: 'hi', attempts: 1, lastError: 'network' });
  expect(clips.pendingFor('e')).toHaveLength(1);
  const clientId = t.pending.list()[0]!.clientId;
  const after = t.make();           // the app restarted
  expect(await after.sendPending()).toEqual([]);
  t.setOnline(true);
  const sent = await after.sendPending();
  expect(sent.map((c) => c.id)).toEqual([`id-${clientId}`]);
  expect(t.posts).toEqual([clientId]);
  expect(t.pending.list()).toEqual([]);
  expect(t.sent).toHaveLength(1);
  expect(await after.sendPending()).toEqual([]); // nothing left: no second POST
  expect(t.posts).toEqual([clientId]);
});

it('online: create sends at once and returns the server clip', async () => {
  const t = build();
  const r = await t.make().create('e', { startMs: 0, endMs: 5_000 }, 'x');
  expect(r).toMatchObject({ kind: 'sent', clip: { startMs: 0, endMs: 5_000 } });
  expect(t.pending.list()).toEqual([]);
});

it('invalid ranges and signed-out listeners never create a row; a refusal for good is kept with its message and not retried', async () => {
  const t = build();
  expect(await t.make().create('e', { startMs: 0, endMs: 500 }, '')).toEqual({ kind: 'invalid', reason: 'too_short' });
  t.setSignedIn(false);
  expect(await t.make().create('e', { startMs: 0, endMs: 5_000 }, '')).toEqual({ kind: 'needsSignIn' });
  expect(t.pending.list()).toEqual([]);
  t.setSignedIn(true);
  const r = await t.make().create('e', { startMs: 0, endMs: 200_000 }, ''); // server says past_end
  expect(r.kind).toBe('pending');
  expect(t.pending.list()[0]).toMatchObject({ lastError: 'past_end', attempts: 1 });
  await t.make().sendPending();
  expect(t.pending.list()[0]).toMatchObject({ attempts: 1 }); // not retried
  expect(t.posts).toEqual([]);
});

it('a network failure on the first pending row stops the pass; the rest wait', async () => {
  const t = build({ online: false });
  const clips = t.make();
  await clips.create('e', { startMs: 0, endMs: 5_000 }, 'a');
  await clips.create('e', { startMs: 0, endMs: 6_000 }, 'b');
  expect(t.pending.list().map((r) => r.attempts)).toEqual([1, 1]);
  t.setOnline(true);
  expect((await clips.sendPending()).map((c) => c.caption)).toEqual(['a', 'b']);
});
