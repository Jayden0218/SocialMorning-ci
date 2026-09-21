import { createAuth, type TokenStore } from '../src/social/auth-store';
import { ApiError, type ApiClient } from '../src/social/api';
import { createMemoryStores } from '../src/storage/memory';
import { hash } from '../src/feeds/hash';

function memToken(): TokenStore & { value?: string } {
  const t: TokenStore & { value?: string } = {
    get: async () => t.value,
    set: async (v) => { t.value = v; },
    clear: async () => { t.value = undefined; },
  };
  return t;
}

const listener = { id: 'L1', email: 'a@x', displayName: 'Alex', createdAt: 'now' };

function fakeApi(over: Partial<ApiClient> = {}): ApiClient {
  const notCalled = () => { throw new Error('unexpected call'); };
  return {
    signUp: async () => ({ token: 'T', listener }),
    signIn: async () => ({ token: 'T', listener }),
    signOut: async () => {},
    me: notCalled, deleteMe: async () => {}, registerEpisode: notCalled, social: notCalled, postComment: notCalled,
    deleteComment: notCalled, react: notCalled, putPositions: notCalled, getPositions: notCalled,
    // M4 — none of these belong to sign-in/out
    postClip: notCalled, getClip: notCalled, deleteClip: notCalled, episodeClips: notCalled, follow: notCalled, unfollow: notCalled,
    profile: notCalled, followers: notCalled, following: notCalled, setPrivacy: notCalled, feed: notCalled, putListened: notCalled,
    ...over,
  };
}

it('sign-in stores the token and the listener row; sign-out clears both and the drafts', async () => {
  const stores = createMemoryStores(hash);
  const token = memToken();
  const auth = createAuth({ api: fakeApi(), stores, token, now: () => 7 });
  stores.drafts.put({ episodeId: 'e', body: 'draft', savedAt: 1 });
  const row = await auth.signIn('a@x', 'pw');
  expect(row).toEqual({ listenerId: 'L1', displayName: 'Alex', email: 'a@x', signedInAt: 7 });
  expect(token.value).toBe('T');
  await auth.signOut();
  expect(token.value).toBeUndefined();
  expect(auth.current()).toBeUndefined();
  expect(stores.drafts.get('e')).toBeUndefined();
});

it('sign-out still clears the phone when the server is unreachable', async () => {
  const stores = createMemoryStores(hash);
  const token = memToken();
  const auth = createAuth({
    api: fakeApi({ signOut: async () => { throw new ApiError('network', 'down', 0); } }),
    stores, token, now: () => 7,
  });
  await auth.signIn('a@x', 'pw');
  await auth.signOut();
  expect(token.value).toBeUndefined();
  expect(auth.current()).toBeUndefined();
});

it('a failed sign-in leaves nothing behind', async () => {
  const stores = createMemoryStores(hash);
  const token = memToken();
  const auth = createAuth({
    api: fakeApi({ signIn: async () => { throw new ApiError('unauthenticated', 'no', 401); } }),
    stores, token, now: () => 7,
  });
  await expect(auth.signIn('a@x', 'pw')).rejects.toMatchObject({ code: 'unauthenticated' });
  expect(token.value).toBeUndefined();
  expect(auth.current()).toBeUndefined();
});
