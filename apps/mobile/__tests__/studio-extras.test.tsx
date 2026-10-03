/**
 * M11 — the app side of the Studio: a host-hidden comment's placeholder, and the show page's
 * announcements and polls (specs/011-m11-studio FR-016, FR-020, FR-023).
 */
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const mockVote = jest.fn();
jest.mock('../src/social/context', () => ({ useSocial: () => ({ api: { votePoll: (...a: unknown[]) => mockVote(...a) }, listener: { listenerId: 'me' } }) }));

import { PLACEHOLDER_TEXT, placeholderFor } from '../src/ui/Placeholder';
import { ShowExtrasBlock } from '../src/ui/ShowExtras';
import type { ShowExtras, ShowPoll } from '../src/social/api';

const texts = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.props['children'] === 'string').map((n) => n.props['children'] as string);
const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance => r.root.find((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');

const poll = (over: Partial<ShowPoll> = {}): ShowPoll => ({
  id: 'p1', question: 'Next topic?', episodeId: null, endsAt: '2026-10-05T00:00:00Z', closedAt: null, open: true, total: 0,
  options: [{ idx: 0, label: 'Books', votes: 0 }, { idx: 1, label: 'Films', votes: 0 }], myVote: null, ...over,
});
const extras = (over: Partial<ShowExtras> = {}): ShowExtras => ({ overrides: null, announcements: [], polls: [], ...over });

it('a host-hidden comment is "Hidden by the host" for others; its author keeps the live row', () => {
  expect(placeholderFor({ deleted: true, hiddenByHost: true })).toBe('hidden_by_host');
  expect(PLACEHOLDER_TEXT.hidden_by_host).toBe('Hidden by the host');
  expect(placeholderFor({ deleted: false, hiddenByHost: true, mine: true })).toBeUndefined();
  expect(placeholderFor({ deleted: true, removed: true, hiddenByHost: true })).toBe('removed');
});

it('renders nothing when the host set nothing', () => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(ShowExtrasBlock, { extras: extras(), onPoll: jest.fn() })); });
  expect(r.toJSON()).toBeNull();
});

it('shows the announcement and hosts; a vote goes to the API and the result replaces the buttons', async () => {
  const voted = poll({ total: 1, myVote: 1, options: [{ idx: 0, label: 'Books', votes: 0 }, { idx: 1, label: 'Films', votes: 1 }] });
  mockVote.mockResolvedValueOnce(voted);
  const onPoll = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(ShowExtrasBlock, { extras: extras({ announcements: [{ id: 'a', body: 'New season Monday', createdAt: '', edited: false }], polls: [poll()], overrides: { title: null, description: null, coverUrl: null, themeColour: null, milestoneMessage: null, hosts: ['Mei'], links: null } }), onPoll })); });
  expect(texts(r)).toEqual(expect.arrayContaining(['New season Monday', 'Next topic?', 'Hosted by Mei']));
  await act(async () => { byLabel(r, 'Vote Films').props['onPress'](); });
  expect(mockVote).toHaveBeenCalledWith('p1', 1);
  expect(onPoll).toHaveBeenCalledWith(voted);
});

it('a closed poll shows its result and takes no vote; on an episode page only that episode\'s poll shows', () => {
  let r!: ReactTestRenderer;
  const closed = poll({ id: 'p2', open: false, total: 4, episodeId: 'e1', options: [{ idx: 0, label: 'Books', votes: 3 }, { idx: 1, label: 'Films', votes: 1 }] });
  act(() => { r = create(createElement(ShowExtrasBlock, { extras: extras({ polls: [closed, poll({ id: 'p3', question: 'Other?' })] }), onPoll: jest.fn(), episodeId: 'e1' })); });
  expect(texts(r)).toEqual(expect.arrayContaining(['Poll closed', '75%', '4 votes']));
  expect(texts(r)).not.toContain('Other?');
  expect(r.root.findAll((n) => typeof n.props['accessibilityLabel'] === 'string' && n.props['accessibilityLabel'].startsWith('Vote '))).toHaveLength(0);
});

it('M14 US3: contacts show on the show page — links and email open, a WeChat ID is text; not on an episode page', () => {
  const o = { title: null, description: null, coverUrl: null, themeColour: null, milestoneMessage: null, hosts: null, links: null,
    contacts: [{ type: 'weibo', value: 'https://weibo.com/x' }, { type: 'email', value: 'hi@example.com' }, { type: 'wechat', value: 'morning_fm' }] };
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(ShowExtrasBlock, { extras: extras({ overrides: o }), onPoll: jest.fn() })); });
  expect(byLabel(r, 'Weibo, opens https://weibo.com/x')).toBeTruthy();
  expect(byLabel(r, 'Email, opens hi@example.com')).toBeTruthy();
  expect(texts(r)).toContain('WeChat: morning_fm');
  act(() => { r.update(createElement(ShowExtrasBlock, { extras: extras({ overrides: o }), onPoll: jest.fn(), episodeId: 'e1' })); });
  expect(r.toJSON()).toBeNull();
});
