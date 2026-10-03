/**
 * Apple's search, with `fetch` mocked. Nothing here talks to Apple: the
 * mapping is what we own, and rate limits are not something a test suite
 * should spend.
 */
import { CatalogError, searchShows } from '../src/catalog/apple';

const ok = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

const notOk = (status: number): Response =>
  ({ ok: false, status }) as unknown as Response;

const APPLE_ROW = {
  collectionId: 123,
  collectionName: 'Reply All',
  artistName: 'Gimlet',
  feedUrl: 'https://feeds.example.com/replyall',
  artworkUrl600: 'https://art.example.com/600.jpg',
  artworkUrl100: 'https://art.example.com/100.jpg',
  trackCount: 187,
  genres: ['Technology', 'Society & Culture'],
};

describe('searchShows', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps Apple’s fields onto ours', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(ok({ resultCount: 1, results: [APPLE_ROW] }));

    await expect(searchShows('reply all')).resolves.toEqual([
      {
        catalogId: 123,
        title: 'Reply All',
        author: 'Gimlet',
        feedUrl: 'https://feeds.example.com/replyall',
        artworkUrl: 'https://art.example.com/600.jpg',
        episodeCount: 187,
        genres: ['Technology', 'Society & Culture'],
      },
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://itunes.apple.com/search?media=podcast&term=reply%20all&limit=25',
    );
  });

  it('falls back to the small artwork and tolerates missing optional fields', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      ok({
        results: [
          {
            collectionId: 9,
            feedUrl: 'https://feeds.example.com/x',
            artworkUrl100: 'https://art.example.com/100.jpg',
          },
        ],
      }),
    );
    await expect(searchShows('x')).resolves.toEqual([
      {
        catalogId: 9,
        title: '',
        author: '',
        feedUrl: 'https://feeds.example.com/x',
        artworkUrl: 'https://art.example.com/100.jpg',
        genres: [],
      },
    ]);
  });

  // Apple lists shows it holds no feed for. They cannot be subscribed to or
  // played, so a row for one is a dead end in the UI.
  it('drops results with no feedUrl', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      ok({ results: [APPLE_ROW, { collectionId: 5, collectionName: 'No feed' }] }),
    );
    const shows = await searchShows('anything');
    expect(shows).toHaveLength(1);
    expect(shows[0]?.catalogId).toBe(123);
  });

  it('handles a response with no results array at all', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ resultCount: 0 }));
    await expect(searchShows('nothing')).resolves.toEqual([]);
  });

  it('makes no request for an empty or whitespace term', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    await expect(searchShows('')).resolves.toEqual([]);
    await expect(searchShows('   ')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws CatalogError carrying the status when Apple rate-limits', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(notOk(429));
    await expect(searchShows('busy')).rejects.toBeInstanceOf(CatalogError);
    await expect(searchShows('busy')).rejects.toMatchObject({ status: 429 });
  });

  it('passes an abort signal through', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ results: [] }));
    const controller = new AbortController();
    await searchShows('x', controller.signal);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({ signal: controller.signal });
  });
});
