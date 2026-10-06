// Tests M21 Interactions on the phone: the client, what a row says, where it opens, and the system card's one button.
/**
 * M21 US10 (T108). A system card's button opens only a page inside the app.
 * The break that turns it red: in src/social/notifications-api.ts `systemAction`, drop the
 * `startsWith('/')` / `//` / `:` checks — "https://evil.example" becomes a button.
 */
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createNotificationsApi, noticeTarget, noticeVerb, systemAction, type Notice } from '@/social/notifications-api';
import { SystemNoticeCard } from '@/ui/social/SystemNoticeCard';

type Call = { url: string; init: RequestInit };
function fakeFetch(handler: (c: Call) => Response) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return handler({ url, init }); }) as unknown as typeof fetch;
  return { f, calls };
}

const actor = { id: 'A', name: 'Bea', avatarUrl: null };
const notice = (over: Partial<Notice>): Notice => ({ id: 'n1', kind: 'reply', actor, ref: {}, createdAt: '2026-10-06T00:00:00.000Z', unread: true, ...over });

it('lists a page with its cursor and marks everything seen', async () => {
  const { f, calls } = fakeFetch((c) => c.url.endsWith('/seen')
    ? new Response(null, { status: 204 })
    : new Response(JSON.stringify({ items: [notice({})], next: '2026-10-05T00:00:00.000Z' }), { status: 200, headers: { 'content-type': 'application/json' } }));
  const api = createNotificationsApi({ baseUrl: 'https://api', fetch: f, getToken: async () => 'tok' });
  const page = await api.list('2026-10-06T00:00:00.000Z');
  expect(page.items).toHaveLength(1);
  expect(page.next).toBe('2026-10-05T00:00:00.000Z');
  expect(calls[0]!.url).toBe('https://api/v1/me/notifications?cursor=2026-10-06T00%3A00%3A00.000Z');
  await api.markSeen();
  expect(calls[1]!.url).toBe('https://api/v1/me/notifications/seen');
  expect(calls[1]!.init.method).toBe('POST');
});

it('a row says what happened and opens its target', () => {
  expect(noticeVerb('reply')).toBe('replied to your comment');
  expect(noticeVerb('like')).toBe('liked your comment');
  expect(noticeVerb('mention')).toBe('mentioned you');
  expect(noticeVerb('follow')).toBe('started following you');
  // A reply opens the thread it is in (the parent's); a like on a top-level comment, that comment's.
  expect(noticeTarget(notice({ kind: 'reply', ref: { commentId: 'r', parentId: 'p' } }))).toEqual({ pathname: '/comments/thread/[commentId]', params: { commentId: 'p' } });
  expect(noticeTarget(notice({ kind: 'like', ref: { commentId: 'c' } }))).toEqual({ pathname: '/comments/thread/[commentId]', params: { commentId: 'c' } });
  expect(noticeTarget(notice({ kind: 'mention', ref: { episodeId: 'e' } }))).toEqual({ pathname: '/episode/[id]', params: { id: 'e' } });
  expect(noticeTarget(notice({ kind: 'follow' }))).toEqual({ pathname: '/profile/[id]', params: { id: 'A' } });
  expect(noticeTarget(notice({ kind: 'like' }))).toEqual({ pathname: '/profile/[id]', params: { id: 'A' } });
});

it("a system card's button is only ever a page inside the app", () => {
  expect(systemAction({ label: 'See your report', route: '/report/2026-09' })).toEqual({ label: 'See your report', route: '/report/2026-09' });
  for (const route of ['https://evil.example', '//evil.example', 'report', 'javascript:alert(1)', '/a b', '/x\\y']) {
    expect(systemAction({ label: 'Go', route })).toBeUndefined();
  }
  expect(systemAction({ label: '', route: '/x' })).toBeUndefined();
  expect(systemAction(undefined)).toBeUndefined();

  const open = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(SystemNoticeCard, { notice: { id: 's', title: 'Your September', body: 'Your report is ready.', createdAt: '2026-10-01T09:00:00.000Z', action: { label: 'See your report', route: '/report/2026-09' } }, onOpen: open })); });
  const button = r.root.findAll((n) => typeof n.props['onPress'] === 'function' && n.props['accessibilityLabel'] === 'See your report')[0];
  expect(button).toBeDefined();
  act(() => { button!.props['onPress'](); });
  expect(open).toHaveBeenCalledWith('/report/2026-09');

  act(() => { r.update(createElement(SystemNoticeCard, { notice: { id: 's', title: 'T', body: 'B', createdAt: '2026-10-01T09:00:00.000Z', action: { label: 'Web', route: 'https://evil.example' } }, onOpen: open })); });
  expect(r.root.findAll((n) => typeof n.props['onPress'] === 'function')).toHaveLength(0);
});
