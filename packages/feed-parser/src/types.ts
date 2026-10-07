// Data shapes for a parsed show, episode, transcript and sound clip.
/** Milliseconds since the Unix epoch. */
export type EpochMs = number;

export type Transcript = {
  url: string;
  /** MIME type — `application/srt`, `text/vtt`, `application/json`. */
  type?: string;
  language?: string;
  rel?: string;
};

/** `podcast:soundbite` — a named range of the episode. A CLIP IS A RANGE: it
 *  carries no media of its own, so it costs no storage and no transcode. */
export type Soundbite = {
  startMs: number;
  durationMs: number;
  title?: string;
};

/** `podcast:person` — someone on the show or the episode (kept for later use, M23 US11). */
export type Person = {
  name: string;
  role?: string;
  group?: string;
  imageUrl?: string;
  href?: string;
};

/** `podcast:funding` — where listeners can support the show (kept for later use). */
export type Funding = {
  url: string;
  title?: string;
};

export type Show = {
  feedUrl: string;
  /** `podcast:guid` — the only identity a feed carries that survives being
   *  moved to another host. Absent on most feeds; fall back to `feedUrl`. */
  guid?: string;
  /** May be empty, with a `missing-title` warning. A feed is not discarded
   *  over it: one broken channel field must not cost every episode. */
  title: string;
  description?: string;
  author?: string;
  imageUrl?: string;
  language?: string;
  explicit: boolean;
  categories: string[];
  link?: string;
  /** `itunes:new-feed-url` — the publisher moved the feed here; a reader should follow it and
   *  move its subscribers (M23 US11). Only set when it differs from `feedUrl`. */
  newFeedUrl?: string;
  /** `itunes:block` = Yes — the publisher asked directories to hide this show. Only set when true. */
  blocked?: true;
  /** Only set when the feed names any. */
  persons?: Person[];
  /** Only set when the feed names any. */
  funding?: Funding[];
  /** Over the channel fields only, so a re-poll can tell "the show changed"
   *  from "an episode was added" without diffing every field. */
  contentHash: string;
};

export type Episode = {
  guid: string;
  /** Which rule produced `guid`. A feed that starts emitting `<guid>` after
   *  publishing without one would otherwise silently duplicate its backlog,
   *  and this field is what lets a migration detect that. */
  guidSource: 'guid' | 'enclosure' | 'derived';
  title: string;
  enclosureUrl: string;
  enclosureType?: string;
  enclosureBytes?: number;
  durationMs?: number;
  publishedAt?: EpochMs;
  shownotesHtml?: string;
  imageUrl?: string;
  season?: number;
  episodeNumber?: number;
  episodeType?: string;
  explicit: boolean;
  chaptersUrl?: string;
  transcripts: Transcript[];
  soundbites: Soundbite[];
  /** `podcast:person` on the item; only set when it names any. */
  persons?: Person[];
  contentHash: string;
};

export type WarningCode =
  | 'item-without-enclosure'
  | 'duplicate-guid'
  | 'unparsable-duration'
  | 'unparsable-date'
  | 'missing-guid'
  | 'relative-enclosure-url'
  | 'unresolvable-enclosure-url'
  | 'missing-title'
  | 'not-rss';

export type FeedWarning = {
  code: WarningCode;
  message: string;
  itemTitle?: string;
};

/** A feed NEVER throws for bad content — it returns what parsed plus what did
 *  not. Per-feed quarantine needs to know a feed is degrading while still
 *  serving the episodes that are fine; an exception collapses both into
 *  "nothing", which is how a publisher's one bad item costs a whole show. */
export type ParsedFeed = {
  show: Show;
  episodes: Episode[];
  warnings: FeedWarning[];
};
