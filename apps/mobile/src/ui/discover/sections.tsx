// Each Discover section: shortcuts, editor picks, For You, the chart, and more.
/**
 * The sections of the redesigned Discover (M10, owner 2026-09-27), top to bottom in the
 * order of the reference screens. Each takes only what it draws and a way to open or
 * play; `app/(tabs)/index.tsx` decides which ones appear (`src/discover/sections.ts`).
 *
 * Owner, 2026-10-05: "Premium picks" stands where 小宇宙 has its 付费精品节目单 — the chart's next six
 * shows, with no price and nothing sold (the app takes no payments yet). "New arrivals" are the
 * newest shows made in the Studio. "Where to start" and "Shows listeners here follow" are gone.
 *
 * M17 (`Home-B`, `Discover-B`): shortcuts are a 3-column grid of white tiles with accent
 * icons; each editor's pick is a white card (accent eyebrow, serif title, the note as a serif
 * quote, the stats and a yellow Play pill); For You is a white card of numbered rows with a
 * "1 / 2 →" page button; the chart opens with a serif "The chart", its tabs become a pill
 * track and its pages get Previous / Next buttons; categories are a 2-column grid of tiles.
 * Every row, tab and link keeps its accessible name and handler.
 *
 * M21 US7 (T082): a pick shows up to 3 faces of people you follow who liked it; each category
 * tile has an × that hides it (`src/discover/hidden-categories.ts`), and "Explore more
 * categories" offers the hidden ones back.
 */
import { useEffect, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit, size } from '@/design';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { GENRES } from '@/discover/genres';
import { listSize } from '@/config/store'; // M25 A7: how many category tiles Discover shows (default 8)
import { warmCategories } from '@/discover/category-cache';
import { useSocial } from '@/social/context';
import { ago, pages, type ChartTab } from '@/discover/sections';
import type { DiscoverItem, EpisodeCard, SaidItem, ShowCard } from '@/social/api';
import { Artwork } from '@/ui/kit/Artwork';
import { Avatar } from '@/ui/kit/Avatar';
import { visibleGenres } from '@/discover/hidden-categories';
import type { Face } from '@/discover/explore-api';
import { Card } from '@/ui/kit/Card';
import { AddButton, EpisodeLine, Pager, SectionTitle, StatsLine, type RowStats } from './parts';
import { plural } from '@socialmorning/social-core';

const TAP = { minHeight: hit.min };
/** M24 US20 (`Home-B` pick card): the 18 pt serif title and the 15 pt italic quote's line height. */
const PICK_TITLE = { fontSize: 18, lineHeight: 22 };
const PICK_QUOTE = { lineHeight: 21 };
const SQUARE = { minHeight: hit.min, minWidth: hit.min };
/**
 * Owner's iPhone, 2026-10-07 ("the elements run away the layout"): with `flexGrow` on wrapped
 * tiles, a last row's single tile stretched the whole width ("Plaza" alone), and a two-line name
 * ("Society & Culture") made its tile taller than the rest. Tiles now sit in fixed rows
 * (`gridRows`): every tile in a grid has the same width and one fixed height; a short last row
 * keeps empty cells instead of stretching.
 */
const SHORTCUT_COLS = 4;
const CATEGORY_COLS = 2;
const SHORTCUT_TILE = { flex: 1, height: 56 };
const CATEGORY_TILE = { flex: 1, height: size.row };
const CELL = { flex: 1 };

/** Items cut into rows of `cols`; the last row is padded with `null` cells so every cell keeps one width. */
export function gridRows<T>(items: readonly T[], cols: number): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    const row: (T | null)[] = items.slice(i, i + cols);
    while (row.length < cols) row.push(null);
    rows.push(row);
  }
  return rows;
}

type Act = { onOpen: (card: EpisodeCard) => void; onPlay: (card: EpisodeCard) => void; stats?: Readonly<Record<string, RowStats>> };

/** The shortcut tiles under the search bar — four to a row, icon over label. */
export function Shortcuts(props: { items: { label: string; icon: IconName; onPress: () => void }[] }): React.ReactElement {
  const stores = useStores();
  // `palette`, not `c`: the map below names each shortcut `c`.
  const palette = useColours(stores.settings);
  return (
    <Box className="gap-gap px-screen-x mt-row">
      {gridRows(props.items, SHORTCUT_COLS).map((row, r) => (
        <Box key={r} className="flex-row gap-gap">
          {row.map((c, i) => c === null ? <Box key={`empty-${i}`} style={CELL} /> : (
            <Pressable key={c.label} onPress={c.onPress} accessibilityRole="button" accessibilityLabel={c.label} className="items-center justify-center gap-0.5 bg-surface border border-border rounded-row px-1" style={SHORTCUT_TILE}>
              <Icon name={c.icon} size={20} color={palette.accent} />
              <Text className="text-text text-xs font-semibold text-center" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{c.label}</Text>
            </Pressable>
          ))}
        </Box>
      ))}
    </Box>
  );
}

/** For You — a card of three numbered rows per page; swipe for the next page. */
export function ForYouSection(props: Act & { rows: { card: EpisodeCard; line: string; index: number }[]; onOpenAt: (card: EpisodeCard, index: number) => void; /** M19 T021: the row's "⋯" (Not interested). */ onMore?: (card: EpisodeCard) => void; /** M19 T021: drawn under the title, e.g. "Hidden · Undo". */ notice?: React.ReactNode }): React.ReactElement | null {
  const [page, setPage] = useState(0);
  if (props.rows.length === 0) return props.notice ? <Box><SectionTitle title="For You" />{props.notice}</Box> : null;
  const p = pages(props.rows);
  const shown = Math.min(page, p.length - 1);
  return (
    <Box>
      {/* Owner, 2026-10-05: no "1 / 7 ›" — the title alone; the pages move by swiping. */}
      <SectionTitle title="For You" />
      {props.notice ?? null}
      <Pager count={p.length} full index={shown} onPage={setPage}>
        {(i) => (
          <Card padded={false} className="px-row">
            {(p[i] ?? []).map((r, j) => (
              <EpisodeLine
                key={r.card.id}
                card={r.card}
                line={r.line}
                rank={i * 3 + j + 1}
                rankTone="accent"
                size={52}
                hideShow
                divided={j > 0}
                {...(props.stats?.[r.card.id] ? { stats: props.stats[r.card.id] } : {})}
                label={`${r.card.title}, ${r.card.showTitle}. ${r.line}`}
                onOpen={() => props.onOpenAt(r.card, r.index)}
                onPlay={() => props.onPlay(r.card)}
                {...(props.onMore ? { onMore: () => props.onMore?.(r.card) } : {})}
              />
            ))}
          </Card>
        )}
      </Pager>
    </Box>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Owner, 2026-10-04: "2026-10-02" reads "Oct 2" — the month and day, no year. Anything else is shown as it came. */
export function shortDate(date: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(date);
  const month = m ? MONTHS[Number(m[1]) - 1] : undefined;
  return m && month ? `${month} ${Number(m[2])}` : date;
}

/**
 * Editor's picks — each pick a white card: the podcast, the episode, the owner's note as a serif
 * quote, the counts, "+" (add to the queue; owner, 2026-10-05) and the design's "▶ Play" pill
 * (`Home-B`; M24 fix F-P, owner 2026-10-08: both — nothing removed). M24 US20 (`Home-B`): the
 * section's title moved inside the card as its label, with "Past picks →".
 */
/** M21: up to 3 faces of people you follow who liked a pick, overlapping, with who in words. */
function Faces(props: { faces: Face[] }): React.ReactElement | null {
  if (props.faces.length === 0) return null;
  const names = props.faces.map((f) => f.displayName);
  const words = names.length === 1 ? `${names[0]} liked this` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} liked this`;
  return (
    <Box className="flex-row items-center gap-2 mt-gap" accessible accessibilityLabel={words}>
      <Box className="flex-row">
        {props.faces.map((f, n) => <Avatar key={f.id} size={22} url={f.avatarUrl} name={f.displayName} className={n > 0 ? '-ml-1.5' : ''} />)}
      </Box>
      <Text className="flex-1 text-muted text-xs" numberOfLines={1}>{words}</Text>
    </Box>
  );
}

/** `Home-B`'s pick Play pill: the fixed strong yellow (`play`, not the accent), 44 pt tall at least, 18 pt sides. */
const PICK_PLAY = { minHeight: hit.min, paddingHorizontal: 18 };
function PickPlay(props: { title: string; onPress: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={`Play ${props.title}`} className="flex-row items-center justify-center gap-gap rounded-pill bg-play" style={PICK_PLAY}>
      <Icon name="play" size={16} color={c.onPlay} />
      <Text className="text-onPlay text-body font-bold">Play</Text>
    </Pressable>
  );
}

export function PicksSection(props: Act & { items: (DiscoverItem & { likedBy?: Face[] })[]; date?: string; onPast?: () => void; onQueue: (card: EpisodeCard) => void; /** M21: "Today's picks" page. */ onDaily?: () => void }): React.ReactElement | null {
  if (props.items.length === 0) return null;
  const label = props.date ? `Editor's pick · ${shortDate(props.date)}` : "Editor's pick";
  return (
    <Box className="mt-row">
      <Box className="gap-row">
        {props.items.map((p, n) => {
          const stats = p.stats ?? props.stats?.[p.episode.id];
          return (
            // M24 US20 (`Home-B`): the label and "Past picks →" sit INSIDE the card; 76 pt cover,
            // show 12 muted, title 18 serif, the note an italic serif quote, the counts, then the
            // owner's "+" (2026-10-05) beside the design's yellow "▶ Play" pill (fix F-P, 2026-10-08).
            <Card key={p.key} className="mx-screen-x pt-2 pb-row">
              <Box className="flex-row items-center justify-between gap-row" style={TAP}>
                <Eyebrow accent className="flex-1">{label}</Eyebrow>
                {n === 0 && props.onPast ? (
                  <Pressable onPress={props.onPast} accessibilityRole="link" accessibilityLabel="Past picks" className="justify-center" style={TAP}>
                    <Text className="text-accent text-meta font-semibold">{'Past picks →'}</Text>
                  </Pressable>
                ) : null}
              </Box>
              <Box className="flex-row gap-3.5 items-start mt-0.5">
                <Pressable onPress={() => props.onOpen(p.episode)} accessibilityRole="button" accessibilityLabel={`${p.episode.title}, ${p.episode.showTitle}`}>
                  <Artwork url={p.episode.imageUrl} size={76} name={p.episode.showTitle} />
                </Pressable>
                <Pressable onPress={() => props.onOpen(p.episode)} className="flex-1 gap-1" accessibilityRole="button" accessibilityLabel={`Open ${p.episode.title}`} style={TAP}>
                  <Text className="text-muted text-xs" numberOfLines={1}>{p.episode.showTitle}</Text>
                  <Text className="text-text font-display" style={PICK_TITLE} numberOfLines={3}>{p.episode.title}</Text>
                </Pressable>
              </Box>
              {p.why ? <Text className="text-text text-lead font-display-semibold italic mt-2.5" style={PICK_QUOTE} numberOfLines={4}>“{p.why}”</Text> : null}
              {p.likedBy ? <Faces faces={p.likedBy} /> : null}
              <Box className="flex-row items-center justify-between gap-2 mt-row">
                {stats ? <StatsLine stats={stats} className="flex-1" /> : <Box className="flex-1" />}
                <AddButton title={p.episode.title} onPress={() => props.onQueue(p.episode)} />
                <PickPlay title={p.episode.title} onPress={() => props.onPlay(p.episode)} />
              </Box>
            </Card>
          );
        })}
      </Box>
      {props.onDaily ? (
        <Pressable onPress={props.onDaily} accessibilityRole="link" accessibilityLabel="Today's picks, with every note" className="items-center justify-center mt-gap" style={TAP}>
          <Text className="text-accent text-meta font-semibold">{"Today's picks, with every note ›"}</Text>
        </Pressable>
      ) : null}
    </Box>
  );
}

/** The chart — three tabs (top, talked about, new shows) in a pill track, numbered rows in pages of three. */
export function ChartSection(props: Act & { tabs: ChartTab[]; onFull?: () => void }): React.ReactElement | null {
  const stores = useStores();
  const c = useColours(stores.settings);
  const [tab, setTab] = useState(0);
  const [page, setPage] = useState(0);
  const current = props.tabs[Math.min(tab, props.tabs.length - 1)];
  if (!current || props.tabs.every((t) => t.rows.length === 0)) return null;
  const p = pages(current.rows);
  const first = page <= 0;
  const last = page >= p.length - 1;
  return (
    <Box>
      <Box className="flex-row items-center justify-between px-screen-x mt-section">
        <Text className="text-text text-hero font-display flex-1" accessibilityRole="header" numberOfLines={1}>The chart</Text>
        {/* M12 FR-071: the whole Talked-about ranking, not only the three pages shown here. */}
        {props.onFull ? (
          <Pressable onPress={props.onFull} accessibilityRole="link" accessibilityLabel="Full chart" className="justify-center pl-row" style={TAP}>
            <Text className="text-accent text-meta font-semibold">Full chart ›</Text>
          </Pressable>
        ) : null}
      </Box>
      {/* The `Segmented` look, drawn here so each tab keeps its own accessible name and handler. */}
      <Box accessibilityRole="tablist" className="flex-row gap-1 p-1 mx-screen-x mt-gap mb-1 bg-surface border border-border rounded-pill">
        {props.tabs.map((t, i) => (
          <Pressable key={t.key} onPress={() => { setTab(i); setPage(0); }} accessibilityRole="tab" accessibilityState={{ selected: i === tab }} accessibilityLabel={`${t.label} chart`} className={`flex-1 rounded-pill items-center justify-center ${i === tab ? 'bg-primary' : ''}`} style={TAP}>
            <Text className={i === tab ? 'text-onPrimary text-meta font-bold' : 'text-muted text-meta font-medium'} numberOfLines={1}>{t.label}</Text>
          </Pressable>
        ))}
      </Box>
      {/* Owner, 2026-10-05: the three tabs always show; an empty one says so. */}
      {p.length === 0 ? <Text className="text-muted text-body px-screen-x py-section text-center">Nothing here yet — check back soon.</Text> : null}
      <Pager key={current.key} count={p.length} full index={page} onPage={setPage}>
        {(i) => (p[i] ?? []).map((card, j) => (
          <EpisodeLine key={card.id} card={card} rank={i * 3 + j + 1} size={60} divided={j > 0} {...(props.stats?.[card.id] ? { stats: props.stats[card.id] } : {})} onOpen={() => props.onOpen(card)} onPlay={() => props.onPlay(card)} />
        ))}
      </Pager>
      {p.length > 1 ? (
        <Box className="flex-row items-center justify-center gap-section border-t-hairline border-separator mx-screen-x">
          <Pressable onPress={() => setPage(Math.max(0, page - 1))} disabled={first} accessibilityRole="button" accessibilityLabel="Previous page" accessibilityState={{ disabled: first }} className={`items-center justify-center ${first ? 'opacity-40' : ''}`} style={SQUARE}>
            <Icon name="chevron-back" size={20} color={c.text} />
          </Pressable>
          <Text className="text-muted text-xs">{`Page ${page + 1} of ${p.length}`}</Text>
          <Pressable onPress={() => setPage(Math.min(p.length - 1, page + 1))} disabled={last} accessibilityRole="button" accessibilityLabel="Next page" accessibilityState={{ disabled: last }} className={`items-center justify-center ${last ? 'opacity-40' : ''}`} style={SQUARE}>
            <Icon name="chevron-forward" size={20} color={c.text} />
          </Pressable>
        </Box>
      ) : null}
    </Box>
  );
}

/** How long after Discover appears the category lists start loading. */
const WARM_AFTER_MS = 1500;

/** Explore by category — genre tiles two to a row; each opens that genre's top shows. */
export function CategoryStrip(props: { onGenre: (id: number) => void; onAll: () => void; /** M21: genre ids hidden with ×. */ hidden?: readonly number[]; onHide?: (id: number) => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const { api } = useSocial();
  // Owner, 2026-10-04: the 8 genres' lists (and first covers) load in the background once
  // Discover has drawn, so a tapped category opens full (src/discover/category-cache.ts).
  useEffect(() => {
    const t = setTimeout(() => warmCategories({ api, cache: stores.feedCache, now: () => Date.now() }, GENRES.slice(0, listSize('discoverCategories')).map((g) => g.id)), WARM_AFTER_MS);
    return () => clearTimeout(t);
  }, [api, stores]);
  return (
    <Box className="mt-row">
      <SectionTitle title="Explore by category" action={{ label: 'All', onPress: props.onAll }} />
      <Box className="gap-gap px-screen-x">
        {gridRows(visibleGenres(GENRES, props.hidden ?? [], listSize('discoverCategories')), CATEGORY_COLS).map((row, r) => (
          <Box key={r} className="flex-row gap-gap">
            {row.map((g, i) => g === null ? <Box key={`empty-${i}`} style={CELL} /> : (
              <Box key={g.id} className="flex-row items-center bg-surface border border-border rounded-row overflow-hidden" style={CATEGORY_TILE}>
                <Pressable onPress={() => props.onGenre(g.id)} accessibilityRole="button" accessibilityLabel={g.name} className="flex-1 min-w-0 flex-row items-center gap-2.5 pl-row" style={TAP}>
                  <Icon name={g.icon} size={20} color={c.accent} />
                  {/* M12 FR-008 (B8) said two lines; owner 2026-10-07: one fixed tile height, so one
                      line that shrinks to fit ("Society & Culture" whole, a little smaller). */}
                  <Text className="text-text text-meta font-semibold flex-1 flex-shrink" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{g.name}</Text>
                </Pressable>
                {props.onHide ? (
                  <Pressable onPress={() => props.onHide?.(g.id)} accessibilityRole="button" accessibilityLabel={`Hide ${g.name}`} className="items-center justify-center" style={SQUARE}>
                    <Icon name="close" size={16} color={c.muted} />
                  </Pressable>
                ) : null}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** Show tiles — artwork, name, one muted line. */
export function ShowTiles(props: { title: string; shows: { feedUrl: string; title: string; imageUrl?: string; line?: string }[]; onShow: (feedUrl: string) => void; badge?: number; boxed?: boolean }): React.ReactElement | null {
  if (props.shows.length === 0) return null;
  return (
    <Box className={props.boxed ? 'mx-screen-x mt-section bg-surface border border-border rounded-row pb-row' : ''}>
      <SectionTitle title={props.title} {...(props.badge !== undefined ? { badge: props.badge } : {})} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-screen-x gap-row">
        {props.shows.map((s) => (
          <Pressable key={s.feedUrl} onPress={() => props.onShow(s.feedUrl)} accessibilityRole="button" accessibilityLabel={s.line ? `${s.title}. ${s.line}` : s.title} className="w-28 gap-1">
            <Artwork url={s.imageUrl} size={108} name={s.title} />
            <Text className="text-text text-meta font-bold mt-1" numberOfLines={2}>{s.title}</Text>
            {s.line ? <Text className="text-muted text-xs" numberOfLines={2}>{s.line}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </Box>
  );
}

export const popularShowTiles = (shows: ShowCard[]) => shows.map((s) => ({ feedUrl: s.feedUrl, title: s.title, ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}), line: s.author }));

/**
 * Owner, 2026-10-05 — "Premium picks", where 小宇宙 has its 付费精品节目单: a card of show rows, each
 * with a "Premium" tag. No price and no buy button — the app sells nothing yet (constitution 2.1.0);
 * a row opens the show page like any other show.
 */
export function PremiumSection(props: { shows: ShowCard[]; onShow: (feedUrl: string) => void }): React.ReactElement | null {
  const stores = useStores();
  const c = useColours(stores.settings);
  if (props.shows.length === 0) return null;
  return (
    <Box>
      <SectionTitle title="Premium picks" />
      <Card padded={false} className="mx-screen-x px-row">
        {props.shows.map((s, k) => (
          <Pressable key={s.feedUrl} onPress={() => props.onShow(s.feedUrl)} accessibilityRole="button" accessibilityLabel={`${s.title}, ${s.author}. Premium pick`} className={`flex-row items-center gap-row py-row ${k > 0 ? 'border-t-hairline border-separator' : ''}`}>
            <Artwork url={s.imageUrl} size={56} name={s.title} />
            <Box className="flex-1 gap-0.5">
              <Text className="text-text text-body font-bold" numberOfLines={2}>{s.title}</Text>
              <Text className="text-muted text-xs" numberOfLines={1}>{s.author}</Text>
              <Box className="flex-row items-center gap-1 self-start bg-playDisc rounded-pill px-2 py-0.5 mt-0.5">
                <Icon name="diamond-outline" size={11} color={c.playGlyph} />
                <Text className="text-text text-micro font-bold">Premium</Text>
              </Box>
            </Box>
            <Icon name="chevron-forward" size={18} color={c.muted} />
          </Pressable>
        ))}
      </Card>
    </Box>
  );
}

/**
 * What listeners said — recent comments, each with its episode. No names: Discover never
 * names a listener (M5 guard G6), so a card says "A listener".
 */
export function SaidSection(props: Act & { items: SaidItem[]; now: number }): React.ReactElement | null {
  if (props.items.length === 0) return null;
  return (
    <Box>
      <SectionTitle title="What listeners said" />
      <Pager count={props.items.length}>
        {(i) => {
          const s = props.items[i];
          if (!s) return null;
          return (
            <Card className="py-section">
              <Text className="text-muted text-xs">{`A listener · ${ago(s.createdAt, props.now)}`}</Text>
              <Text className="text-text text-sm font-display-semibold text-center my-section" numberOfLines={4}>“{s.body}”</Text>
              <Box className="border-t-hairline border-separator">
                <EpisodeLine card={s.episode} size={44} onOpen={() => props.onOpen(s.episode)} onPlay={() => props.onPlay(s.episode)} />
              </Box>
            </Card>
          );
        }}
      </Pager>
    </Box>
  );
}

/** Owner, 2026-10-05 — "New arrivals": the newest shows made here, each with its latest episode. */
export function NewArrivalsSection(props: Act & { items: { show: ShowCard; episode: EpisodeCard }[] }): React.ReactElement | null {
  if (props.items.length === 0) return null;
  return (
    <Box>
      <SectionTitle title="New arrivals" />
      <Card padded={false} className="mx-screen-x px-row">
        {props.items.map((n, k) => (
          <EpisodeLine key={n.episode.id} card={n.episode} size={56} divided={k > 0} line={n.show.episodeCount !== undefined ? `New show · ${plural(n.show.episodeCount, 'episode')}` : 'New show'} {...(props.stats?.[n.episode.id] ? { stats: props.stats[n.episode.id] } : {})} onOpen={() => props.onOpen(n.episode)} onPlay={() => props.onPlay(n.episode)} />
        ))}
      </Card>
    </Box>
  );
}

/** M21: with tiles hidden, a second line lists them, each tapped to show it again. */
export function MoreCategories(props: { onPress: () => void; hidden?: readonly number[]; onShow?: (id: number) => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const hidden = GENRES.filter((g) => (props.hidden ?? []).includes(g.id));
  return (
    <Box className="items-center mt-section">
      <Pressable onPress={props.onPress} accessibilityRole="link" accessibilityLabel="Explore more categories" className="items-center justify-center" style={TAP}>
        <Text className="text-accent text-meta font-semibold">Explore more categories ›</Text>
      </Pressable>
      {props.onShow && hidden.length > 0 ? (
        <Box className="flex-row flex-wrap justify-center gap-gap px-screen-x">
          {hidden.map((g) => (
            <Pressable key={g.id} onPress={() => props.onShow?.(g.id)} accessibilityRole="button" accessibilityLabel={`Show ${g.name} again`} className="flex-row items-center gap-1 px-row rounded-pill bg-surface border border-border" style={TAP}>
              <Icon name="add" size={14} color={c.muted} />
              <Text className="text-muted text-xs font-semibold">{g.name}</Text>
            </Pressable>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

/** M10b US5 — "Podcasts you can watch": video episodes as wide tiles, each opening its episode. */
export function VideoSection(props: Act & { items: DiscoverItem[] }): React.ReactElement | null {
  if (props.items.length === 0) return null;
  return (
    <Box>
      <SectionTitle title="Podcasts you can watch" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-screen-x gap-row">
        {props.items.map((i) => (
          <Pressable key={i.key} onPress={() => props.onOpen(i.episode)} accessibilityRole="button" accessibilityLabel={`Video: ${i.episode.title}, ${i.episode.showTitle}`} className="w-60 bg-surface border border-border rounded-artwork overflow-hidden">
            <Artwork url={i.episode.imageUrl} size={240} rounded="row" name={i.episode.showTitle} />
            <Box className="p-row">
              <Text className="text-text text-body font-display-semibold" numberOfLines={2}>{i.episode.title}</Text>
              <Text className="text-muted text-xs" numberOfLines={1}>{`▶ Video · ${i.episode.showTitle}`}</Text>
            </Box>
          </Pressable>
        ))}
      </ScrollView>
    </Box>
  );
}
