// Tests chat merging: new messages join once, in id order, and the list preview line.
/**
 * Chat (owner, 2026-10-04). The poll returns the message just sent again, and ids are numbers
 * as text ("9" < "10"), so merging must keep one copy of each, ordered by number, not by text.
 * The break that turns it red: in `byIdOrder` (src/social/chat-api.ts) compare only `a < b`.
 */
import { mergeMessages, newestId, previewOf, type ChatMessage } from '@/social/chat-api';

const msg = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({ id, fromMe: false, body: `m${id}`, createdAt: '2026-10-04T00:00:00Z', read: false, ...over });

it('merges by id: one copy each, the newer copy wins, ordered as numbers', () => {
  const known = [msg('9'), msg('10', { fromMe: true })];
  const merged = mergeMessages(known, [msg('10', { fromMe: true, read: true }), msg('11'), msg('8')]);
  expect(merged.map((m) => m.id)).toEqual(['8', '9', '10', '11']);
  expect(merged.find((m) => m.id === '10')?.read).toBe(true);
  expect(newestId(merged)).toBe('11');
  expect(newestId([])).toBeUndefined();
});

it('the preview names you, and an episode-only message says what it shared', () => {
  expect(previewOf(msg('1', { body: ' hi ' }))).toBe('hi');
  expect(previewOf(msg('2', { fromMe: true, body: 'yo' }))).toBe('You: yo');
  const episode = { id: 'e', feedUrl: 'f', guid: 'g', title: 'Ep one', showTitle: 'Show', enclosureUrl: 'u' };
  expect(previewOf(msg('3', { body: '', episode }))).toBe('Shared an episode: Ep one');
});
