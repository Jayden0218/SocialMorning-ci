// Checks the seven M24 phone fixes (lane F-P) stay fixed.
/**
 * Owner, 2026-10-08, "fix all":
 *  1. the rating prompt opened on every start — it asks until any answer, then never again
 *     (guard G-M24-FP1; the break: make `shouldAskRating` return true again, as `EVERY_START` did);
 *  2. the main Play buttons are the fixed strong yellow (`play`), whatever the accent theme;
 *  3. the Home pick card has the design's "▶ Play" pill AND keeps "+";
 *  4. an episode its creator hid leaves the phone's lists (guard G-M24-FP2; the break: make
 *     `withoutHidden` in src/feeds/hidden.ts return every episode);
 *  5. a multiple-choice poll shows every chosen option, and a tap toggles one;
 *  6. Notifications has "System notices" (server key `system`, on by default);
 *  7. after an email change: "Email changed. Signed out of N other devices."
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import type { CachedEpisode } from '@/storage/types';

const mockVote = jest.fn();
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: { votePoll: (...a: unknown[]) => mockVote(...a) }, listener: { listenerId: 'me' } }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined } }), useToast: () => () => undefined, useCovered: () => false }));

import { RATE_KEY, rateMayAsk, shouldAskRating } from '@/ui/shell/RateSheet';
import * as RateModule from '@/ui/shell/RateSheet';
import { ACCENTS, colour, PAIRS, contrastRatio, BODY_MIN } from '@/design';
import { withAccent } from '@/design/accent';
import { hiddenKey, readHiddenGuids, refreshHiddenGuids, saveHiddenGuids, visibleEpisodes, withoutHidden } from '@/feeds/hidden';
import { latestUpdates } from '@/me/updates';
import { searchLibrary } from '@/discover/local-search';
import { ShowExtrasBlock, chosenOptions } from '@/ui/show/ShowExtras';
import type { ShowPoll } from '@/social/api';
import { getPref } from '@/settings/prefs';
import { createAccountApi, emailChangedLine } from '@/social/account-api';

const ROOT = join(__dirname, '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const memory = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k), set: (k: string, v: string) => { m.set(k, v); }, delete: (k: string) => { m.delete(k); } };
};

describe('1. G-M24-FP1: the rating prompt asks once, never again after any answer', () => {
  it('asks while there is no answer', () => {
    const s = memory();
    expect(shouldAskRating(s as never)).toBe(true);
    expect(rateMayAsk(s as never, { onTabs: true, blockedThisLaunch: false })).toBe(true);
  });
  it.each(['rate', 'feedback', 'closed'])('after "%s" it never asks again', (answer) => {
    const s = memory();
    s.set(RATE_KEY, answer);
    expect(shouldAskRating(s as never)).toBe(false);
    expect(rateMayAsk(s as never, { onTabs: true, blockedThisLaunch: false })).toBe(false);
  });
  it('the testing switch is gone, and every way out of the sheet records an answer', () => {
    expect('EVERY_START' in RateModule).toBe(false);
    const src = read('src/ui/shell/RateSheet.tsx');
    expect(src).toMatch(/stores\.settings\.set\(RATE_KEY, a\)/);
    expect(src).toMatch(/onClose=\{\(\) => answer\('closed'\)\}/);
    expect(src).toMatch(/onPress=\{\(\) => answer\('feedback'\)\}/);
    expect(src).toMatch(/onPress=\{\(\) => answer\('rate'\)\}/);
  });
});

describe('2. main Play buttons are the fixed strong yellow, whatever the accent', () => {
  it('`play` is #fcc522 with dark words under every accent theme, and the pair clears 4.5', () => {
    for (const name of Object.keys(ACCENTS) as (keyof typeof ACCENTS)[]) {
      const p = withAccent(colour, name);
      expect(p.play).toBe('#fcc522');
      expect(p.onPlay).toBe('#111114');
    }
    expect(withAccent(colour, 'teal').primary).not.toBe('#fcc522');
    expect(PAIRS.some((p) => p.fg === colour.onPlay && p.bg === colour.play)).toBe(true);
    expect(contrastRatio(colour.onPlay, colour.play)).toBeGreaterThanOrEqual(BODY_MIN);
  });
  it('global.css carries the token (light, dark and the theme)', () => {
    expect(read('global.css').match(/--color-play: #fcc522;/g)).toHaveLength(3);
    expect(read('global.css').match(/--color-onPlay: #111114;/g)).toHaveLength(3);
  });
  it('player, Episode, Queue (page + sheet), Play it and the mini ring use it, not `primary`', () => {
    expect(read('app/player.tsx')).toMatch(/const PLAY = '[^']*\bbg-play\b/);
    expect(read('app/player.tsx')).toMatch(/size=\{34\} color=\{c\.onPlay\}/);
    const ep = read('app/episode/[id].tsx');
    expect(ep).toMatch(/rounded-pill bg-play items-center justify-center px-section/);
    expect(ep).toMatch(/text-onPlay text-body font-bold" numberOfLines=\{1\}>\{playLabel\}/);
    const q = read('src/ui/queue/QueueList.tsx');
    expect(q.match(/bg-play rounded-pill" style=\{ROW_TAP\}|rounded-pill bg-play" style=\{PILL\}/g)).toHaveLength(2);
    expect(q.match(/text-onPlay [^"]*">Play now/g)).toHaveLength(2);
    expect(read('src/ui/player/EndOffer.tsx')).toMatch(/bg-play rounded-pill[\s\S]*color=\{c\.onPlay\}[\s\S]*text-onPlay/);
    const ring = read('src/ui/player/PlayRing.tsx');
    expect(ring).toMatch(/borderTopColor: c\.play\b/);
    expect(ring).not.toMatch(/c\.primary/);
  });
});

describe('3. the Home pick card: "+" and the design\'s Play pill, side by side', () => {
  it('both sit in the card\'s foot; the pill is the fixed yellow', () => {
    const s = read('src/ui/discover/sections.tsx');
    const picks = s.slice(s.indexOf('export function PicksSection('), s.indexOf('/** The chart'));
    expect(picks).toMatch(/<AddButton title=\{p\.episode\.title\} onPress=\{\(\) => props\.onQueue\(p\.episode\)\} \/>\s*<PickPlay title=\{p\.episode\.title\} onPress=\{\(\) => props\.onPlay\(p\.episode\)\} \/>/);
    expect(s).toMatch(/function PickPlay[\s\S]*rounded-pill bg-play[\s\S]*text-onPlay text-body font-bold">Play</);
  });
});

const ep = (guid: string, publishedAt: number): CachedEpisode => ({
  id: `id-${guid}`, feedUrl: 'https://f/a.xml', guid, guidSource: 'guid', title: `Title ${guid}`, enclosureUrl: `https://a/${guid}.mp3`, publishedAt,
} as unknown as CachedEpisode);

describe('4. G-M24-FP2: an episode its creator hid is not listed', () => {
  const FEED = 'https://f/a.xml';
  const eps = [ep('new', 3), ep('hidden', 2), ep('old', 1)];
  const stores = (settings: ReturnType<typeof memory>) => ({
    settings: settings as never,
    subscriptions: { list: () => [{ feedUrl: FEED }] } as never,
    feeds: { listEpisodes: () => eps, getShow: () => ({ title: 'Show A' }), getEpisode: () => undefined } as never,
  });

  it('withoutHidden drops exactly the hidden guids', () => {
    expect(withoutHidden(eps, new Set(['hidden'])).map((e) => e.guid)).toEqual(['new', 'old']);
    expect(withoutHidden(eps, new Set()).map((e) => e.guid)).toEqual(['new', 'hidden', 'old']);
  });

  it('the remembered answer is read back; an empty answer clears it; junk reads as none', () => {
    const s = memory();
    saveHiddenGuids(s, FEED, ['hidden', 'hidden']);
    expect([...readHiddenGuids(s, FEED)]).toEqual(['hidden']);
    saveHiddenGuids(s, FEED, []);
    expect(readHiddenGuids(s, FEED).size).toBe(0);
    s.set(hiddenKey(FEED), 'not json');
    expect(readHiddenGuids(s, FEED).size).toBe(0);
    s.set(hiddenKey(FEED), '{"a":1}');
    expect(readHiddenGuids(s, FEED).size).toBe(0);
    expect(readHiddenGuids(undefined, FEED).size).toBe(0);
  });

  it('Updates (and so play-latest, the car, Siri), the library search and the show list leave it out', () => {
    const s = memory();
    saveHiddenGuids(s, FEED, ['hidden']);
    const st = stores(s);
    expect(visibleEpisodes(st, FEED).map((e) => e.guid)).toEqual(['new', 'old']);
    expect(latestUpdates(st, new Set()).map((r) => r.episode.guid)).toEqual(['new', 'old']);
    expect(searchLibrary(st, 'Title').episodes.map((e) => e.guid)).toEqual(['new', 'old']);
  });

  it('each refresh asks the server per show; a failed answer keeps the last one', async () => {
    const s = memory();
    saveHiddenGuids(s, FEED, ['hidden']);
    await refreshHiddenGuids(s, [FEED, 'https://f/b.xml'], async (f) => { if (f === FEED) throw new Error('offline'); return ['x']; });
    expect([...readHiddenGuids(s, FEED)]).toEqual(['hidden']);
    expect([...readHiddenGuids(s, 'https://f/b.xml')]).toEqual(['x']);
  });

  it('the show page, the subscriptions page and the library refresh are wired to it', () => {
    const show = read('app/show/[feedUrl].tsx');
    expect(show).toMatch(/const visible = withoutHidden\(episodes, hiddenGuids\)/);
    expect(show).toMatch(/saveHiddenGuids\(stores\.settings, feedUrl, serverHidden\)/);
    expect(read('app/subscriptions.tsx')).toMatch(/const latest = visibleEpisodes\(stores, feedUrl\)\[0\]/);
    const wired = /refreshAll\(stores, Date\.now\(\), PER_FEED_TIMEOUT_MS, (?:social\.)?api\?\.hiddenEpisodes\)/g;
    expect(read('app/subscriptions.tsx').match(wired)).toHaveLength(1);
    expect(read('app/(tabs)/library.tsx').match(wired)).toHaveLength(2);
    expect(read('src/social/api.ts')).toMatch(/\/v1\/shows\/hidden-episodes\?feedUrl=/);
  });
});

const texts = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.props['children'] === 'string').map((n) => n.props['children'] as string);
const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance => r.root.find((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
const poll = (over: Partial<ShowPoll> = {}): ShowPoll => ({
  id: 'p1', question: 'Which topics?', episodeId: null, endsAt: '2026-10-30T00:00:00Z', closedAt: null, open: true, total: 3,
  options: [{ idx: 0, label: 'Books', votes: 2 }, { idx: 1, label: 'Films', votes: 1 }, { idx: 2, label: 'Games', votes: 0 }],
  multi: true, voters: 2, myVote: 0, myVotes: [0, 1], ...over,
});

describe('5. a multiple-choice poll shows every chosen option; a tap toggles one', () => {
  it('chosenOptions: myVotes when sent, else the single myVote', () => {
    expect([...chosenOptions({ myVotes: [0, 2] })]).toEqual([0, 2]);
    expect([...chosenOptions({ myVote: 1 })]).toEqual([1]);
    expect(chosenOptions({ myVote: null }).size).toBe(0);
    expect(chosenOptions({}).size).toBe(0);
  });

  it('both chosen options are marked; tapping a chosen one removes it, an unchosen one adds it', async () => {
    const onPoll = jest.fn();
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(ShowExtrasBlock, { extras: { overrides: null, announcements: [], polls: [poll()] }, onPoll })); });
    expect(texts(r)).toEqual(expect.arrayContaining(['Books ✓', 'Films ✓', 'Games', 'Poll from the host · choose any', '2 voters · tap an answer to add or remove it']));
    // Share of voters: Books 2 of 2.
    expect(texts(r)).toContain('100%');
    const toggled = poll({ myVotes: [0], options: [{ idx: 0, label: 'Books', votes: 2 }, { idx: 1, label: 'Films', votes: 0 }, { idx: 2, label: 'Games', votes: 0 }] });
    mockVote.mockResolvedValueOnce(toggled);
    await act(async () => { byLabel(r, 'Films: 50 percent, chosen, tap to remove').props['onPress'](); });
    expect(mockVote).toHaveBeenLastCalledWith('p1', 1);
    expect(onPoll).toHaveBeenLastCalledWith(toggled);
    mockVote.mockResolvedValueOnce(poll());
    await act(async () => { byLabel(r, 'Games: 0 percent, tap to add').props['onPress'](); });
    expect(mockVote).toHaveBeenLastCalledWith('p1', 2);
  });

  it('a single-choice poll is as before: one ✓, the chosen row takes no tap', () => {
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(ShowExtrasBlock, { extras: { overrides: null, announcements: [], polls: [poll({ multi: false, myVotes: [0], myVote: 0, total: 2, voters: 2, options: [{ idx: 0, label: 'Books', votes: 1 }, { idx: 1, label: 'Films', votes: 1 }] })] }, onPoll: jest.fn() })); });
    expect(texts(r).filter((t) => t.endsWith('✓'))).toEqual(['Books ✓']);
    expect(texts(r)).toContain('2 votes · tap another answer to change your vote');
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Books: 50 percent, your vote' && typeof n.props['onPress'] === 'function' && n.props['disabled'] === false)).toHaveLength(0);
  });
});

describe('6. Notifications: "System notices", server key `system`, on by default', () => {
  it('the row and its default', () => {
    expect(read('app/settings/push.tsx')).toMatch(/\{ key: 'system', pref: 'pushSystem', label: 'System notices', line: 'Notices from SocialNet' \}/);
    expect(getPref(memory() as never, 'pushSystem')).toBe(true);
  });
});

describe('7. change email: how many other devices were signed out', () => {
  it('the line', () => {
    expect(emailChangedLine(0)).toBe('Email changed.');
    expect(emailChangedLine(1)).toBe('Email changed. Signed out of 1 other device.');
    expect(emailChangedLine(3)).toBe('Email changed. Signed out of 3 other devices.');
  });
  it('the client reads `signedOut` (absent → 0) and the page shows the line', async () => {
    const answer = (body: unknown) => ({
      baseUrl: 'https://api.test', getToken: async () => 'tok',
      fetch: (async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch,
    });
    expect(await createAccountApi(answer({ email: 'n@e.com', signedOut: 2 })).confirmEmailChange('123456')).toEqual({ email: 'n@e.com', signedOut: 2 });
    expect(await createAccountApi(answer({ email: 'n@e.com' })).confirmEmailChange('123456')).toEqual({ email: 'n@e.com', signedOut: 0 });
    expect(read('app/settings/account-email.tsx')).toMatch(/toast\(emailChangedLine\(now\.signedOut\)\)/);
  });
});
