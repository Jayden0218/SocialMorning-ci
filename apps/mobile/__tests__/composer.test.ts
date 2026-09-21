import { createComposer } from '../src/social/composer';
import { createDrafts } from '../src/social/drafts';
import { createSocialCache } from '../src/social/cache';
import { ApiError, type ApiClient, type Comment, type Social } from '../src/social/api';
import { createMemoryDraftStore, createMemorySocialCacheStore } from '../src/storage/memory';

jest.useFakeTimers();

const comment: Comment = { id: 'c1', authorId: 'L', displayName: 'A', body: 'hi', offsetMs: 872_000, parentId: null, createdAt: 'now', deleted: false, mine: true };
const social: Social = { serverTime: 's', episode: { id: 'e', durationMs: 2_899_000 }, comments: [comment], heat: { available: false } };

function build(over: Partial<ApiClient> = {}, signedIn = true) {
  const calls: string[] = [];
  const api = {
    registerEpisode: async () => { calls.push('register'); },
    postComment: async () => { calls.push('post'); return comment; },
    social: async () => { calls.push('social'); return { status: 200 as const, etag: '"v"', body: social }; },
    deleteComment: async () => { calls.push('delete'); return { placeholder: false }; },
    ...over,
  } as unknown as ApiClient;
  const draftStore = createMemoryDraftStore();
  const cacheStore = createMemorySocialCacheStore();
  const composer = createComposer({
    api, drafts: createDrafts(draftStore, () => 1), cache: createSocialCache(cacheStore),
    isSignedIn: () => signedIn, now: () => 9,
    registration: () => ({ feedUrl: 'f', guid: 'g', title: 't', enclosureUrl: 'u' }),
  });
  return { composer, calls, draftStore, cacheStore };
}

it('signed out: submit sends nothing and keeps body + moment as a draft', async () => {
  const { composer, calls, draftStore } = build({}, false);
  let s = composer.open({ episodeId: 'e', offsetMs: 872_000, durationMs: 2_899_000 });
  s = composer.edit(s, 'worth it');
  expect(await composer.submit(s)).toEqual({ kind: 'needsSignIn' });
  expect(calls).toEqual([]);
  expect(draftStore.get('e')).toMatchObject({ body: 'worth it', offsetMs: 872_000 });
  // Reopening after sign-in restores the draft, moment included, not a new capture.
  const again = composer.open({ episodeId: 'e', offsetMs: 999_000 });
  expect(again.moment).toEqual({ offsetMs: 872_000 });
  expect(again.body).toBe('worth it');
});

it('failure keeps the draft; success registers, posts, refetches once, clears the draft, fills the cache', async () => {
  const failing = build({ postComment: async () => { throw new ApiError('network', 'down', 0); } });
  let s = failing.composer.open({ episodeId: 'e', offsetMs: 1000 });
  s = failing.composer.edit(s, 'try');
  const r = await failing.composer.submit(s);
  expect(r).toMatchObject({ kind: 'failed', error: { code: 'network' } });
  expect(failing.draftStore.get('e')?.body).toBe('try');

  const ok = build();
  let t = ok.composer.open({ episodeId: 'e', offsetMs: 872_000, durationMs: 2_899_000 });
  t = ok.composer.edit(t, 'hi');
  const posted = await ok.composer.submit(t);
  expect(posted).toEqual({ kind: 'posted', comment });
  expect(ok.calls).toEqual(['register', 'post', 'social']);
  expect(ok.draftStore.get('e')).toBeUndefined();
  expect(JSON.parse(ok.cacheStore.get('e')!.bodyJson).comments).toHaveLength(1);
});

it('removeMoment posts a plain comment; canSubmit rejects whitespace and > 2000 chars', async () => {
  const { composer } = build();
  let s = composer.open({ episodeId: 'e', offsetMs: 5000 });
  expect(s.moment).toEqual({ offsetMs: 5000 });
  s = composer.removeMoment(s);
  expect(s.moment).toBeNull();
  expect(composer.canSubmit(composer.edit(s, '   '))).toBe(false);
  expect(composer.canSubmit(composer.edit(s, 'x'.repeat(2001)))).toBe(false);
  expect(composer.canSubmit(composer.edit(s, 'ok'))).toBe(true);
});
