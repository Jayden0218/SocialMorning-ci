/**
 * M16a guard G-B4 (FR-006). Phone walk 2026-10-02: Inbox flashed "0 new … Nothing new" for a
 * moment before its 68 rows. The page started from an empty list and filled it after the first
 * frame (useFocusEffect). It now starts in `loading`, says "Nothing new" only for a finished
 * empty read, and shows an error with Retry if the read throws.
 *
 * The break that turns it red: render the empty state while loading — make `inboxBody` return
 * 'empty' for `{ kind: 'loading' }` in src/me/inbox.ts, or start app/inbox.tsx from
 * `{ kind: 'ok', ids: [] }`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inboxBody, loadInbox } from '@/me/inbox';

it('before the first answer: loading — never "empty"', () => {
  expect(inboxBody({ kind: 'loading' })).toBe('loading');
});

it('"empty" only for a finished read with nothing in it; rows are a list', () => {
  expect(inboxBody({ kind: 'ok', ids: [] })).toBe('empty');
  expect(inboxBody({ kind: 'ok', ids: ['e1'] })).toBe('list');
});

it('a read that throws is an error (Retry), not "Nothing new"', () => {
  const broken = { subscriptions: { list: () => { throw new Error('db closed'); } } } as never;
  expect(loadInbox(broken)).toEqual({ kind: 'error' });
  expect(inboxBody(loadInbox(broken))).toBe('error');
});

it('the page starts loading and draws the loader for it', () => {
  const page = readFileSync(join(__dirname, '../app/inbox.tsx'), 'utf8');
  expect(page).toMatch(/useState<InboxLoad>\(\{ kind: 'loading' \}\)/);
  expect(page).toMatch(/body === 'loading' \? <Loader/);
  // The "N new" line waits for an answer too.
  expect(page).toMatch(/ListHeaderComponent=\{load\.kind === 'ok'/);
});
