// M24 lane A1 on the phone: system notices, appeals (with the suspension's token), shared lists, the notice push path.
import { createNotificationsApi, parseSystemNotices } from '@/social/notifications-api';
import { appealLine, createAppealsApi, parseAppealable } from '@/social/appeals-api';
import { createListsApi, parseSharedList } from '@/social/lists-api';
import { requester } from '@/social/api';
import { routeForPush } from '@/notify/route';

type Call = { url: string; init: RequestInit };
function fakeFetch(handler: (c: Call) => Response) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return handler({ url, init }); }) as unknown as typeof fetch;
  return { f, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const headersOf = (c: Call) => c.init.headers as Record<string, string>;

it('US3: system notices — the list is read from the server; a bad row is dropped; a web link never becomes a button', async () => {
  const items = [
    { id: 'n1', title: 'New: chat', body: 'You can chat now.', createdAt: '2026-10-08T00:00:00.000Z', action: { label: 'Open chats', route: '/inbox' } },
    { id: 'n2', title: 'Hi', body: 'B', createdAt: '2026-10-08T00:00:00.000Z', action: { label: 'Web', route: 'https://evil.example' } },
    { id: 3, title: 'bad' },
    null,
  ];
  expect(parseSystemNotices({ items })).toEqual([
    { id: 'n1', title: 'New: chat', body: 'You can chat now.', createdAt: '2026-10-08T00:00:00.000Z', action: { label: 'Open chats', route: '/inbox' } },
    { id: 'n2', title: 'Hi', body: 'B', createdAt: '2026-10-08T00:00:00.000Z' },
  ]);
  expect(parseSystemNotices(null)).toEqual([]);
  expect(parseSystemNotices({ items: 'x' })).toEqual([]);
  const { f, calls } = fakeFetch(() => json({ items: items.slice(0, 1) }));
  const api = createNotificationsApi({ baseUrl: 'https://api', fetch: f, getToken: async () => 'tok' });
  expect(await api.system()).toHaveLength(1);
  expect(calls[0]!.url).toBe('https://api/v1/me/notifications/system');
});

it('US3: a notice push opens the System page', () => {
  expect(routeForPush({ href: '/notifications/system' })).toBe('/notifications/system');
});

it('US6: appealable rows, their line, and malformed rows dropped', () => {
  const rows = parseAppealable({ items: [
    { actionId: 'a1', action: 'remove', what: 'Your comment “hm” was removed', at: '2026-10-08T00:00:00.000Z', appeal: null },
    { actionId: 'a2', action: 'suspend', what: 'Your account was suspended', at: '2026-10-08T00:00:00.000Z', appeal: { id: 'p', state: 'open', createdAt: '2026-10-08T01:00:00.000Z' } },
    { actionId: 'a3', action: 'remove', what: 'x', at: 't', appeal: { id: 'q', state: 'odd', createdAt: 't' } },
    { actionId: 'a4', action: 'dismiss', what: 'x', at: 't' },
    null,
  ] });
  expect(rows.map((r) => [r.actionId, r.appeal?.state ?? null])).toEqual([['a1', null], ['a2', 'open'], ['a3', null]]);
  expect(parseAppealable(undefined)).toEqual([]);
  expect(appealLine({ appeal: null })).toBe('You can appeal this once.');
  expect(appealLine({ appeal: { id: 'p', state: 'open', createdAt: 't' } })).toBe('Appeal sent. We will tell you what we decide.');
  expect(appealLine({ appeal: { id: 'p', state: 'accepted', createdAt: 't' } })).toBe('Appeal accepted.');
  expect(appealLine({ appeal: { id: 'p', state: 'rejected', createdAt: 't' } })).toBe('Appeal not accepted.');
});

it('US6: a suspended phone (no session) appeals with the token the refusal carried; with no token it sends none', async () => {
  const { f, calls } = fakeFetch((c) => (c.init.method === 'POST' ? json({ id: 'x' }, 201) : json({ items: [] })));
  let token: string | undefined = 'tok.1.sig';
  const api = createAppealsApi({ baseUrl: 'https://api', fetch: f, getToken: async () => undefined, appealToken: () => token });
  await api.list();
  await api.send('a1', `  ${'w'.repeat(1200)}  `);
  expect(headersOf(calls[0]!)['x-appeal-token']).toBe('tok.1.sig');
  expect(headersOf(calls[0]!)['authorization']).toBeUndefined();
  expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ actionId: 'a1', text: 'w'.repeat(1000) });
  token = undefined;
  await api.list();
  expect(headersOf(calls[2]!)['x-appeal-token']).toBeUndefined();
});

it('US6: the suspended answer hands its appeal token to onSuspended', async () => {
  const seen: unknown[] = [];
  const { f } = fakeFetch(() => json({ error: 'suspended', message: 'This account is suspended.', appeals: 'a@x', appealToken: 'T' }, 403));
  const call = requester({ baseUrl: 'https://api', fetch: f, getToken: async () => 'tok', onSuspended: (...a) => { seen.push(a); } });
  await expect(call('GET', '/v1/me')).rejects.toMatchObject({ code: 'suspended' });
  expect(seen).toEqual([['This account is suspended.', 'a@x', 'T']]);
});

it('US1: a shared list is read and checked; a broken answer is undefined', async () => {
  const body = { id: 'abcdefghij', title: 'Mine', owner: { id: 'o', displayName: 'Ow' }, shows: [{ feedUrl: 'https://f/1', title: 'One', imageUrl: null }, { feedUrl: 'https://f/2' }, { nope: 1 }] };
  expect(parseSharedList(body)).toEqual({ id: 'abcdefghij', title: 'Mine', owner: { id: 'o', displayName: 'Ow' }, shows: [{ feedUrl: 'https://f/1', title: 'One', imageUrl: null }, { feedUrl: 'https://f/2', title: 'https://f/2', imageUrl: null }] });
  expect(parseSharedList({ id: 'x' })).toBeUndefined();
  expect(parseSharedList(null)).toBeUndefined();
  expect(parseSharedList({ ...body, shows: undefined })!.shows).toEqual([]);
  const { f, calls } = fakeFetch(() => json(body));
  expect((await createListsApi({ baseUrl: 'https://api', fetch: f, getToken: async () => undefined }).get('abcdefghij'))!.title).toBe('Mine');
  expect(calls[0]!.url).toBe('https://api/v1/lists/abcdefghij');
});
