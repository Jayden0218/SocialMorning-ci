/**
 * A fake Apple catalogue for the pglite tests: recorded shapes from the real endpoints
 * (2026-09-22 — "Casey Wants to Believe", "reply all", genre 1303). Mode switches let a
 * test fail one call or rate-limit everything.
 */
export type FakeMode = { episodes?: 'ok' | 'fail'; shows?: 'ok' | 'fail'; all?: 'ok' | '429'; latency?: number };

export const CASEY = {
  wrapperType: 'podcastEpisode', kind: 'podcast-episode', trackName: 'Casey Wants to Believe', collectionName: 'Reply All', collectionId: 941907967,
  episodeGuid: 'c0633378-b188-11ef-bcb2-677967fca1e9', episodeUrl: 'https://chrt.fm/track/15E3G4/traffic.megaphone.fm/GLT5843461507.mp3?updated=1733238939',
  feedUrl: 'https://feeds.megaphone.fm/replyall', releaseDate: '2024-12-05T08:00:00Z', trackTimeMillis: 2057000, artworkUrl600: 'https://img/replyall600.jpg',
};
export const REPLY_ALL = { wrapperType: 'track', kind: 'podcast', collectionId: 941907967, collectionName: 'Reply All', artistName: 'Gimlet', feedUrl: 'https://feeds.megaphone.fm/replyall', artworkUrl600: 'https://img/replyall600.jpg', genres: ['Technology', 'Podcasts'] };
export const NO_FEED_SHOW = { wrapperType: 'track', kind: 'podcast', collectionId: 1, collectionName: 'No Feed', artistName: 'x' };
export const CHART_SHOW = { wrapperType: 'track', kind: 'podcast', collectionId: 360084272, collectionName: 'The Joe Rogan Experience', artistName: 'Joe Rogan', feedUrl: 'https://feeds.megaphone.fm/GLT1412515089', genres: ['Comedy'] };
export const CHART_LATEST = { wrapperType: 'podcastEpisode', kind: 'podcast-episode', trackName: '#2400 - Someone', collectionName: 'The Joe Rogan Experience', collectionId: 360084272, episodeGuid: 'jre-2400', episodeUrl: 'https://cdn/jre2400.mp3', feedUrl: 'https://feeds.megaphone.fm/GLT1412515089', releaseDate: '2026-09-21T10:00:00Z', trackTimeMillis: 10_000_000 };

export function fakeApple(mode: FakeMode = {}): { fetch: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const f = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (mode.latency) await new Promise((r) => setTimeout(r, mode.latency));
    if (mode.all === '429') return json({}, 429);
    if (url.includes('entity=podcastEpisode') && url.includes('/search')) {
      if (mode.episodes === 'fail') return json({}, 503);
      return json({ resultCount: 2, results: [CASEY, { ...CASEY, episodeGuid: undefined, trackName: 'no guid: dropped' }] });
    }
    if (url.includes('entity=podcast&') && url.includes('/search')) {
      if (mode.shows === 'fail') return json({}, 503);
      return json({ resultCount: 2, results: [REPLY_ALL, NO_FEED_SHOW] });
    }
    if (url.includes('/rss/toppodcasts/')) return json({ feed: { entry: [{ id: { attributes: { 'im:id': '360084272' } } }, { id: { attributes: { 'im:id': '941907967' } } }] } });
    if (url.includes('/lookup') && url.includes('entity=podcastEpisode')) return json({ resultCount: 2, results: [CHART_SHOW, CHART_LATEST] });
    if (url.includes('/lookup')) return json({ resultCount: 2, results: [CHART_SHOW, REPLY_ALL] });
    return json({ error: 'unknown fake url' }, 404);
  }) as typeof fetch;
  return { fetch: f, calls };
}

/** A small RSS feed for the feed-fetch tests: two episodes, a category, a show image. */
export const FIXTURE_FEED = `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
<title>Fixture Show</title><itunes:author>Fx</itunes:author><itunes:image href="https://img/show.png"/><itunes:category text="Technology"/>
<item><title>Newest</title><guid>g-new</guid><pubDate>Mon, 21 Sep 2026 10:00:00 GMT</pubDate><enclosure url="https://cdn/new.mp3" length="1000" type="audio/mpeg"/><itunes:duration>00:30:00</itunes:duration></item>
<item><title>Older</title><guid>g-old</guid><pubDate>Mon, 14 Sep 2026 10:00:00 GMT</pubDate><enclosure url="https://cdn/old.mp3" length="1000" type="audio/mpeg"/><itunes:duration>1800</itunes:duration></item>
<item><title>Broken (no enclosure)</title><guid>g-broken</guid></item>
</channel></rss>`;

export function fakeFeedFetch(xml: string = FIXTURE_FEED, status = 200): typeof fetch {
  return (async () => new Response(xml, { status, headers: { 'content-type': 'application/rss+xml' } })) as typeof fetch;
}
