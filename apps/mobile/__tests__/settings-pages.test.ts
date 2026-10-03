/**
 * M10's settings, the logic under the pages: defaults, one-tap Queue with "download
 * queued episodes", minor mode, OPML both ways, the collected-information list, and the
 * feedback email. The breaks that turn these red: in `src/settings/queue.ts` drop the
 * `getPref(…'autoDownloadQueued')` check (auto-download test); in `src/me/updates.ts`
 * drop the `noExplicit` filter (minor mode test).
 */
import type { Episode, ParsedFeed, Show } from '@socialmorning/feed-parser';
import { hash } from '../src/feeds/hash';
import { inboxIds } from '../src/inbox';
import { latestUpdates } from '../src/me/updates';
import { collectedList } from '../src/settings/collected';
import { feedbackMailto, listFeedback, rememberFeedback } from '../src/settings/feedback';
import { fromOpml, toOpml } from '../src/settings/opml';
import { getPref, PREFS, setPref } from '../src/settings/prefs';
import { queueEpisode } from '../src/settings/queue';
import { createMemoryStores } from '../src/storage/memory';

const F = 'https://f/a.xml';
const show: Show = { feedUrl: F, title: 'A', explicit: false, categories: [], contentHash: 'h' };
const ep = (guid: string, publishedAt: number, explicit: boolean): Episode => ({ guid, guidSource: 'guid', title: guid, enclosureUrl: `https://cdn/${guid}.mp3`, publishedAt, explicit, transcripts: [], soundbites: [], contentHash: `h-${guid}` });
const feed = (episodes: Episode[]): ParsedFeed => ({ show, episodes, warnings: [] });

it('every switch has its documented default until it is set', () => {
  const { settings } = createMemoryStores(hash);
  for (const name of Object.keys(PREFS) as (keyof typeof PREFS)[]) expect(getPref(settings, name)).toBe(PREFS[name].default);
  setPref(settings, 'personalRecs', false);
  expect(getPref(settings, 'personalRecs')).toBe(false);
});

it('one-tap Queue: end by default, front when switched; downloads only when "download queued" is on', () => {
  const stores = createMemoryStores(hash);
  const request = jest.fn(async () => ({ kind: 'queued' as const }));
  expect(queueEpisode(stores, { request }, 'e1', 1)).toMatchObject({ kind: 'queued', where: 'end', downloading: false });
  expect(request).not.toHaveBeenCalled();
  setPref(stores.settings, 'queueAddToEnd', false);
  setPref(stores.settings, 'autoDownloadQueued', true);
  expect(queueEpisode(stores, { request }, 'e2', 2)).toMatchObject({ kind: 'queued', where: 'front', downloading: true });
  expect(request).toHaveBeenCalledWith('e2');
  expect(stores.queue.list()).toEqual(['e2', 'e1']);
  // An explicit choice (the episode page's two buttons) wins over the switch.
  expect(queueEpisode(stores, undefined, 'e3', 3, 'end')).toMatchObject({ where: 'end', downloading: false });
});

it('minor mode hides explicit episodes from Updates and the inbox', () => {
  const stores = createMemoryStores(hash);
  stores.feeds.put(F, feed([ep('clean', 20, false), ep('rude', 30, true)]), {}, 1);
  stores.subscriptions.add(F, 0);
  expect(latestUpdates(stores, new Set()).map((r) => r.episode.guid)).toEqual(['rude', 'clean']);
  setPref(stores.settings, 'hideExplicit', true);
  expect(latestUpdates(stores, new Set()).map((r) => r.episode.guid)).toEqual(['clean']);
  expect(inboxIds(stores).map((id) => stores.feeds.getEpisode(id)?.guid)).toEqual(['clean']);
});

it('OPML: export then import gives back the same feeds; junk and duplicates are ignored', () => {
  const text = toOpml([{ feedUrl: 'https://a.example/f.xml?x=1&y=2', title: 'A & B' }, { feedUrl: 'https://b.example/f.xml' }], new Date(0));
  expect(text).toContain('xmlUrl="https://a.example/f.xml?x=1&amp;y=2"');
  expect(fromOpml(text)).toEqual(['https://a.example/f.xml?x=1&y=2', 'https://b.example/f.xml']);
  expect(fromOpml("<outline xmlUrl='https://c/x' /><outline xmlUrl=\"javascript:alert(1)\"/><outline xmlUrl='https://c/x'/>")).toEqual(['https://c/x']);
});

it('the collected list counts what this phone holds, and nothing when signed out', () => {
  const g = collectedList({ signedIn: false, history: 7, favourites: 2, moments: 1, searches: 3, subscriptions: 4 });
  const items = Object.fromEntries(g.flatMap((x) => x.items).map((i) => [i.id, i.count]));
  expect(items).toMatchObject({ account: 0, email: 0, history: 7, favourites: 2, moments: 1, searches: 3, subscriptions: 4 });
});

it('feedback: the email carries the kind and the text; a copy is kept, newest first', () => {
  const url = feedbackMailto('help@x.org', 'Using the app', '  It crashed  ', '0.1.0');
  expect(url.startsWith('mailto:help@x.org?subject=')).toBe(true);
  expect(decodeURIComponent(url)).toContain('SocialNet feedback — Using the app');
  expect(decodeURIComponent(url)).toContain('It crashed\n\n— SocialNet 0.1.0');
  const { settings } = createMemoryStores(hash);
  rememberFeedback(settings, 'Using the app', 'one', 1);
  rememberFeedback(settings, 'Suggestion or other', 'two', 2);
  expect(listFeedback(settings).map((f) => f.body)).toEqual(['two', 'one']);
});
