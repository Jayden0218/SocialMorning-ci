import { XMLParser } from 'fast-xml-parser';
import { parseDateMs, parseDurationMs } from './duration';
import type { Episode, FeedWarning, ParsedFeed, Show, Soundbite, Transcript } from './types';

/** Stable and deterministic; Node passes sha256, the app passes a pure-JS
 *  hash (src/feeds/hash.ts). Output must be at least 16 hex characters. */
export type Hash = (canonical: string) => string;

export type ParseOptions = {
  hash: Hash;
};

/**
 * `parseTagValue: false` is the load-bearing option here. With coercion on,
 * a `<guid>0123</guid>` becomes the NUMBER 123 — a different identity from
 * the string the feed published, so the episode re-imports as new on every
 * poll. Every value is kept as text and coerced deliberately below.
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
});

type Node = Record<string, unknown>;

function asNode(value: unknown): Node | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Node)
    : undefined;
}

/** A tag appearing once parses as an object, twice as an array. Every
 *  repeatable tag must come through here or it works on multi-entry feeds
 *  and silently reads `[0]` of a string on single-entry ones. */
function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const node = asNode(value);
  if (node) {
    const text = node['#text'];
    if (typeof text === 'string') return text.trim() || undefined;
    if (typeof text === 'number') return String(text);
  }
  return undefined;
}

function attrOf(value: unknown, name: string): string | undefined {
  const node = asNode(Array.isArray(value) ? value[0] : value);
  if (!node) return undefined;
  const attr = node[`@_${name}`];
  if (typeof attr === 'string') return attr.trim() || undefined;
  if (typeof attr === 'number') return String(attr);
  return undefined;
}

function intOf(value: unknown): number | undefined {
  const text = textOf(value);
  if (text === undefined) return undefined;
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/** `itunes:explicit` has been `yes`/`no` and `true`/`false` across two spec
 *  revisions, and both still appear. Anything unrecognised is NOT explicit:
 *  failing open here would mislabel a clean show, which is the worse error. */
function explicitOf(value: unknown): boolean {
  const text = textOf(value)?.toLowerCase();
  return text === 'yes' || text === 'true';
}

/**
 * THE ONE CHANGE from the handoff source (research R6): the digest is
 * injected rather than imported. `node:crypto` does not exist on the phone,
 * and this package has to run in both places — Node tests pass sha256, the
 * app passes a pure-JS hash. The canonical-string construction, which is what
 * actually decides whether a re-poll reports "changed", is unchanged.
 */
function hasher(hash: Hash): (parts: (string | number | undefined)[]) => string {
  return (parts) => hash(parts.map((p) => (p === undefined ? '\u0000' : String(p))).join('\u0001'));
}

function isAbsolute(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function resolveUrl(raw: string, base: string): string | undefined {
  try {
    return new URL(raw, base).toString();
  } catch {
    return undefined;
  }
}

export function parseFeed(xml: string, feedUrl: string, opts: ParseOptions): ParsedFeed {
  const hash = hasher(opts.hash);
  const warnings: FeedWarning[] = [];
  const warn = (code: FeedWarning['code'], message: string, itemTitle?: string): void => {
    warnings.push(itemTitle === undefined ? { code, message } : { code, message, itemTitle });
  };

  const root = asNode(parser.parse(xml));
  const channel = asNode(asNode(root?.['rss'])?.['channel']);

  if (!channel) {
    // Atom and JSON Feed exist but are vanishingly rare for podcasts, and
    // guessing at a shape we have not seen is worse than saying so.
    warn('not-rss', `No rss > channel element found in ${feedUrl}`);
    return {
      show: { feedUrl, title: '', explicit: false, categories: [], contentHash: hash([feedUrl]) },
      episodes: [],
      warnings,
    };
  }

  const show = readShow(channel, feedUrl, warn, hash);
  const episodes = readEpisodes(channel, feedUrl, warn, hash);
  return { show, episodes, warnings };
}

type Warn = (code: FeedWarning['code'], message: string, itemTitle?: string) => void;

/** A bound `hasher(...)`: canonical parts in, a stable hex digest out. */
type Parts = (parts: (string | number | undefined)[]) => string;

function readShow(channel: Node, feedUrl: string, warn: Warn, hash: Parts): Show {
  const title = textOf(channel['title']);
  if (title === undefined) {
    warn('missing-title', `Channel has no <title> in ${feedUrl}`);
  }

  // `itunes:image` carries the url in @href; plain RSS `<image>` nests a
  // `<url>`. Prefer iTunes: it is the square artwork every client wants.
  const imageUrl =
    attrOf(channel['itunes:image'], 'href') ?? textOf(asNode(channel['image'])?.['url']);

  const categories = toArray(channel['itunes:category'])
    .flatMap((entry) => {
      const top = attrOf(entry, 'text');
      const nested = toArray(asNode(entry)?.['itunes:category']).map((sub) => attrOf(sub, 'text'));
      return [top, ...nested];
    })
    .filter((value): value is string => value !== undefined);

  const description = textOf(channel['description']) ?? textOf(channel['itunes:summary']);
  const author = textOf(channel['itunes:author']) ?? textOf(channel['managingEditor']);
  const language = textOf(channel['language']);
  const link = textOf(channel['link']);
  const guid = textOf(channel['podcast:guid']);

  return {
    feedUrl,
    ...(guid !== undefined && { guid }),
    title: title ?? '',
    ...(description !== undefined && { description }),
    ...(author !== undefined && { author }),
    ...(imageUrl !== undefined && { imageUrl }),
    ...(language !== undefined && { language }),
    explicit: explicitOf(channel['itunes:explicit']),
    categories,
    ...(link !== undefined && { link }),
    contentHash: hash([title, description, author, imageUrl, language, link, guid, ...categories]),
  };
}

function readEpisodes(channel: Node, feedUrl: string, warn: Warn, hash: Parts): Episode[] {
  const episodes: Episode[] = [];
  const seen = new Set<string>();

  for (const raw of toArray(channel['item'])) {
    const item = asNode(raw);
    if (!item) continue;

    const title = textOf(item['title']) ?? '';

    // An item with no playable media is not an episode. Publishers emit these
    // for announcements and for items whose media is still uploading;
    // admitting one gives the app a row that cannot be played.
    const rawEnclosure = attrOf(item['enclosure'], 'url');
    if (rawEnclosure === undefined) {
      warn('item-without-enclosure', 'Item has no <enclosure url>, skipped', title);
      continue;
    }

    let enclosureUrl = rawEnclosure;
    if (!isAbsolute(rawEnclosure)) {
      const resolved = resolveUrl(rawEnclosure, feedUrl);
      if (resolved === undefined) {
        warn('unresolvable-enclosure-url', `Cannot resolve "${rawEnclosure}", skipped`, title);
        continue;
      }
      // Protocol-relative (`//cdn/x.mp3`) and path-relative urls both appear.
      // Resolving is right; recording it is how a feed that regressed gets
      // noticed rather than silently re-pointing every episode.
      warn('relative-enclosure-url', `Resolved "${rawEnclosure}" against the feed url`, title);
      enclosureUrl = resolved;
    }

    const declaredGuid = textOf(item['guid']);
    let guid = declaredGuid;
    let guidSource: Episode['guidSource'] = 'guid';
    if (guid === undefined) {
      warn('missing-guid', 'Item has no <guid>; using the enclosure url', title);
      guid = enclosureUrl;
      guidSource = 'enclosure';
    }

    if (seen.has(guid)) {
      // Real and common: a publisher re-posts an item without changing its
      // guid. First wins, because the feed is newest-first by convention.
      warn('duplicate-guid', `Duplicate guid "${guid}", later item skipped`, title);
      continue;
    }
    seen.add(guid);

    const rawDuration = textOf(item['itunes:duration']);
    const durationMs = parseDurationMs(rawDuration);
    if (rawDuration !== undefined && durationMs === undefined) {
      warn('unparsable-duration', `Could not read duration "${rawDuration}"`, title);
    }

    const rawDate = textOf(item['pubDate']);
    const publishedAt = parseDateMs(rawDate);
    if (rawDate !== undefined && publishedAt === undefined) {
      warn('unparsable-date', `Could not read pubDate "${rawDate}"`, title);
    }

    // `content:encoded` holds the full HTML shownotes; `description` is often
    // a truncated plain-text version of the same thing. Prefer the richer one.
    const shownotesHtml =
      textOf(item['content:encoded']) ?? textOf(item['description']) ?? textOf(item['itunes:summary']);

    const enclosureType = attrOf(item['enclosure'], 'type');
    const enclosureBytes = Number(attrOf(item['enclosure'], 'length'));
    const imageUrl = attrOf(item['itunes:image'], 'href');
    const season = intOf(item['itunes:season']);
    const episodeNumber = intOf(item['itunes:episode']);
    const episodeType = textOf(item['itunes:episodeType']);
    const chaptersUrl = attrOf(item['podcast:chapters'], 'url');

    const transcripts: Transcript[] = toArray(item['podcast:transcript'])
      .map((entry) => {
        const url = attrOf(entry, 'url');
        if (url === undefined) return undefined;
        const type = attrOf(entry, 'type');
        const language = attrOf(entry, 'language');
        const rel = attrOf(entry, 'rel');
        return {
          url,
          ...(type !== undefined && { type }),
          ...(language !== undefined && { language }),
          ...(rel !== undefined && { rel }),
        };
      })
      .filter((value): value is Transcript => value !== undefined);

    const soundbites: Soundbite[] = toArray(item['podcast:soundbite'])
      .map((entry) => {
        const startMs = parseDurationMs(attrOf(entry, 'startTime'));
        const durationMsValue = parseDurationMs(attrOf(entry, 'duration'));
        if (startMs === undefined || durationMsValue === undefined) return undefined;
        const soundbiteTitle = textOf(entry);
        return {
          startMs,
          durationMs: durationMsValue,
          ...(soundbiteTitle !== undefined && { title: soundbiteTitle }),
        };
      })
      .filter((value): value is Soundbite => value !== undefined);

    episodes.push({
      guid,
      guidSource,
      title,
      enclosureUrl,
      ...(enclosureType !== undefined && { enclosureType }),
      ...(Number.isFinite(enclosureBytes) && enclosureBytes > 0 && { enclosureBytes }),
      ...(durationMs !== undefined && { durationMs }),
      ...(publishedAt !== undefined && { publishedAt }),
      ...(shownotesHtml !== undefined && { shownotesHtml }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(season !== undefined && { season }),
      ...(episodeNumber !== undefined && { episodeNumber }),
      ...(episodeType !== undefined && { episodeType }),
      explicit: explicitOf(item['itunes:explicit']),
      ...(chaptersUrl !== undefined && { chaptersUrl }),
      transcripts,
      soundbites,
      // Deliberately NOT over the whole item: a feed that regenerates its
      // `<description>` whitespace on every build would otherwise report
      // every episode as changed on every poll.
      contentHash: hash([title, enclosureUrl, durationMs, publishedAt, shownotesHtml]),
    });
  }

  return episodes;
}
