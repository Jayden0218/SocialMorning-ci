// The app settings the admin may change: each key's shape, its default, and the one check the server and the phone share.
/**
 * M25 A7 (`app_config`). The server stores one JSON value per key and refuses a value this file
 * calls bad; the phone reads the server's answer through `readConfig`, which keeps every good key
 * and falls back to the default for a missing or bad one (constitution IV: degrade partially).
 *
 * The defaults ARE today's app: the 8 Discover tiles in today's order, the bundled categories in
 * the bundled order, no renamed section, today's list sizes, today's rate prompt (ask once, after
 * 1.5 s, never again), and the hints worked out from the charts. Nothing changes until an admin
 * saves a value.
 */

export const CONFIG_KEYS = ['shortcuts', 'genres', 'sectionTitles', 'listSizes', 'ratePrompt', 'searchHints'] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];

/** The Discover shortcut tiles, in today's order (apps/mobile/src/ui/discover/DiscoverShortcuts.tsx draws them). */
export const SHORTCUT_IDS = ['categories', 'queue', 'issues', 'friends', 'academy', 'premium', 'plaza', 'talked'] as const;
export type ShortcutId = (typeof SHORTCUT_IDS)[number];
export const SHORTCUT_LABELS: Readonly<Record<ShortcutId, string>> = {
  categories: 'Categories', queue: 'Queue', issues: 'Issues', friends: 'Friends listening',
  academy: 'Academy', premium: 'Premium', plaza: 'Plaza', talked: 'Talked about',
};

/** Apple's top-level genre ids in the phone's bundled order (apps/mobile/src/discover/genres.ts). */
export const DEFAULT_GENRE_ORDER: readonly number[] = [1321, 1324, 1304, 1303, 1489, 1318, 1533, 1512, 1487, 1301, 1488, 1483, 1309, 1310, 1545, 1502, 1305, 1314, 1511];

/** The Discover section titles an admin may rename (the default English title is the key). */
export const DISCOVER_SECTION_TITLES = [
  'For You', 'Shows picked for you', 'Explore by category', 'Popular shows', 'Premium picks',
  'What listeners said', 'New arrivals', 'Podcasts you can watch', 'Topic lists', 'Treasure hunt', 'Their likes',
] as const;
export type SectionTitleKey = (typeof DISCOVER_SECTION_TITLES)[number];

export const LIST_SIZES = {
  discoverCategories: { label: 'Category tiles on Discover', def: 8, min: 0, max: 19 },
  searchCategories: { label: 'Category tiles on Search', def: 4, min: 0, max: 8 },
  searchHints: { label: 'Rotating hints in the search box', def: 5, min: 1, max: 10 },
} as const;
export type ListSizeKey = keyof typeof LIST_SIZES;

export const LABEL_MAX = 24;
export const GENRE_NAME_MAX = 32;
export const TITLE_MAX = 40;
export const HINT_MAX = 40;
export const HINTS_MAX = 10;
export const URL_MAX = 300;
export const DELAY_MAX_MS = 60_000;
export const REASK_MAX_DAYS = 365;

export type Shortcut = { id: ShortcutId; label?: string; hidden?: boolean };
export type GenreSetting = { id: number; name?: string; hidden?: boolean };
export type RatePrompt = { enabled: boolean; delayMs: number; reaskAfterDays: number | null; storeUrls: { ios?: string; android?: string } };
export type AppConfig = {
  shortcuts: Shortcut[];
  genres: GenreSetting[];
  sectionTitles: Partial<Record<SectionTitleKey, string>>;
  listSizes: Record<ListSizeKey, number>;
  ratePrompt: RatePrompt;
  /** Empty → the phone works the hints out from the charts, as before. */
  searchHints: string[];
};

export const CONFIG_DEFAULTS: AppConfig = {
  shortcuts: SHORTCUT_IDS.map((id) => ({ id })),
  genres: [],
  sectionTitles: {},
  listSizes: { discoverCategories: 8, searchCategories: 4, searchHints: 5 },
  ratePrompt: { enabled: true, delayMs: 1500, reaskAfterDays: null, storeUrls: {} },
  searchHints: [],
};

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

class Bad extends Error {}
const bad = (msg: string): never => { throw new Bad(msg); };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const list = (v: unknown, max: number, what: string): unknown[] => (Array.isArray(v) && v.length <= max ? v : bad(`${what} must be a list of at most ${max}.`));
const obj = (v: unknown, what: string): Record<string, unknown> => (isObj(v) ? v : bad(`${what} must be an object.`));
/** An optional text: missing or blank → undefined; else trimmed, 1..max characters. */
const text = (v: unknown, max: number, what: string): string | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') return bad(`${what} must be text.`);
  const t = v.trim();
  return t.length > max ? bad(`${what} is at most ${max} characters.`) : t || undefined;
};
const flag = (v: unknown, what: string): boolean | undefined => (v === undefined || typeof v === 'boolean' ? v : bad(`${what} must be true or false.`));
const int = (v: unknown, min: number, max: number, what: string): number =>
  (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : bad(`${what} must be a whole number from ${min} to ${max}.`));
const unique = <T>(xs: readonly T[], what: string): void => { if (new Set(xs).size !== xs.length) bad(`${what} is listed twice.`); };
const withOpt = <T extends object>(base: T, extra: Record<string, unknown>): T => {
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) (base as Record<string, unknown>)[k] = v;
  return base;
};
const https = (v: unknown, what: string): string | undefined => {
  const t = text(v, URL_MAX, what);
  return t === undefined || /^https:\/\/[^\s<>"']+$/.test(t) ? t : bad(`${what} must start with https://.`);
};

const CHECKS: { [K in ConfigKey]: (v: unknown) => AppConfig[K] } = {
  shortcuts: (v) => {
    const rows = list(v, SHORTCUT_IDS.length, 'Shortcuts').map((r) => {
      const o = obj(r, 'A shortcut');
      const id = (SHORTCUT_IDS as readonly unknown[]).includes(o['id']) ? (o['id'] as ShortcutId) : bad(`Unknown shortcut ${String(o['id'])}.`);
      return withOpt<Shortcut>({ id }, { label: text(o['label'], LABEL_MAX, 'A label'), hidden: flag(o['hidden'], 'Hidden') });
    });
    unique(rows.map((r) => r.id), 'A shortcut');
    return rows;
  },
  genres: (v) => {
    const rows = list(v, 50, 'Categories').map((r) => {
      const o = obj(r, 'A category');
      const id = int(o['id'], 1, 1_000_000, 'A category id');
      return withOpt<GenreSetting>({ id }, { name: text(o['name'], GENRE_NAME_MAX, 'A category name'), hidden: flag(o['hidden'], 'Hidden') });
    });
    unique(rows.map((r) => r.id), 'A category');
    return rows;
  },
  sectionTitles: (v) => {
    const out: Partial<Record<SectionTitleKey, string>> = {};
    for (const [k, t] of Object.entries(obj(v, 'Section titles'))) {
      if (!(DISCOVER_SECTION_TITLES as readonly string[]).includes(k)) bad(`Unknown section "${k}".`);
      const s = text(t, TITLE_MAX, `The title for "${k}"`);
      if (s !== undefined) out[k as SectionTitleKey] = s;
    }
    return out;
  },
  listSizes: (v) => {
    const o = obj(v, 'List sizes');
    for (const k of Object.keys(o)) if (!(k in LIST_SIZES)) bad(`Unknown list size "${k}".`);
    const out = { ...CONFIG_DEFAULTS.listSizes };
    for (const k of Object.keys(LIST_SIZES) as ListSizeKey[]) {
      if (o[k] !== undefined) out[k] = int(o[k], LIST_SIZES[k].min, LIST_SIZES[k].max, LIST_SIZES[k].label);
    }
    return out;
  },
  ratePrompt: (v) => {
    const o = obj(v, 'The rate prompt');
    const urls = obj(o['storeUrls'] ?? {}, 'Store links');
    return {
      enabled: flag(o['enabled'], 'On') ?? true,
      delayMs: o['delayMs'] === undefined ? 1500 : int(o['delayMs'], 0, DELAY_MAX_MS, 'The delay'),
      reaskAfterDays: o['reaskAfterDays'] === undefined || o['reaskAfterDays'] === null ? null : int(o['reaskAfterDays'], 1, REASK_MAX_DAYS, 'Ask again after'),
      storeUrls: withOpt<RatePrompt['storeUrls']>({}, { ios: https(urls['ios'], 'The App Store link'), android: https(urls['android'], 'The Google Play link') }),
    };
  },
  searchHints: (v) => {
    const words = list(v, HINTS_MAX, 'Search hints').map((w) => text(w, HINT_MAX, 'A hint')).filter((w): w is string => w !== undefined);
    unique(words, 'A hint');
    return words;
  },
};

export const isConfigKey = (k: string): k is ConfigKey => (CONFIG_KEYS as readonly string[]).includes(k);

/** The server's check before a save, and the phone's per key: the cleaned value, or why not. */
export function checkConfig<K extends ConfigKey>(key: K, value: unknown): Checked<AppConfig[K]> {
  try {
    return { ok: true, value: CHECKS[key](value) };
  } catch (e) {
    return { ok: false, error: (e as Bad).message };
  }
}

/** Whatever the server sent → a whole config: each good key kept, each missing or bad key its default. */
export function readConfig(raw: unknown): AppConfig {
  const o = isObj(raw) ? raw : {};
  const out = { ...CONFIG_DEFAULTS };
  for (const k of CONFIG_KEYS) {
    if (o[k] === undefined) continue;
    const c = checkConfig(k, o[k]);
    if (c.ok) (out as Record<ConfigKey, unknown>)[k] = c.value;
  }
  return out;
}

/**
 * Saved settings over a default list: the saved order first (ids not in `ids` dropped), then any
 * id the saved list does not name in its default place — so a tile or genre a newer build adds
 * still shows. Hidden rows are left out.
 */
export function orderedVisible<I, R extends { id: I; hidden?: boolean }>(ids: readonly I[], saved: readonly R[]): { id: I; row?: R }[] {
  const named = saved.filter((r) => ids.includes(r.id));
  const rest = ids.filter((id) => !named.some((r) => r.id === id));
  return [...named.map((r) => ({ id: r.id, row: r })), ...rest.map((id) => ({ id }))].filter((x) => x.row?.hidden !== true);
}
