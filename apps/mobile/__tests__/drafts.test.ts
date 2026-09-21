import { createDrafts } from '../src/social/drafts';
import { createMemoryDraftStore } from '../src/storage/memory';

jest.useFakeTimers();

it('a draft with a moment survives a simulated sign-in round trip (US1 #6)', () => {
  const store = createMemoryDraftStore();
  const drafts = createDrafts(store, () => 42);
  drafts.save({ episodeId: 'e', body: 'the bit about', offsetMs: 872_000 });
  drafts.save({ episodeId: 'e', body: 'the bit about the', offsetMs: 872_000 });
  expect(store.get('e')).toBeUndefined(); // debounced
  jest.advanceTimersByTime(500);
  expect(store.get('e')).toEqual({ episodeId: 'e', body: 'the bit about the', offsetMs: 872_000, savedAt: 42 });

  // "Sign in" = a brand-new Drafts over the same store, as after a navigation.
  const after = createDrafts(store, () => 43);
  expect(after.load('e')?.offsetMs).toBe(872_000);
  after.clear('e');
  expect(after.load('e')).toBeUndefined();
});

it('flush writes immediately and a cleared pending draft is not written later', () => {
  const store = createMemoryDraftStore();
  const drafts = createDrafts(store, () => 1);
  drafts.save({ episodeId: 'e', body: 'x' });
  drafts.flush();
  expect(store.get('e')?.body).toBe('x');
  drafts.save({ episodeId: 'e', body: 'y' });
  drafts.clear('e');
  jest.advanceTimersByTime(600);
  expect(store.get('e')).toBeUndefined();
});
