/**
 * The sections of the redesigned Discover (M10, owner 2026-09-27), top to bottom in the
 * order of the reference screens. Each takes only what it draws and a way to open or
 * play; `app/(tabs)/index.tsx` decides which ones appear (`src/discover/sections.ts`).
 *
 * Two sections of the reference are not here, on purpose: video podcasts (the player
 * plays audio only) and paid shows (the app has none — a banner would lead nowhere).
 *
 * M17 (`Home-B`, `Discover-B`): shortcuts are a 3-column grid of white tiles with accent
 * icons; each editor's pick is a white card (accent eyebrow, serif title, the note as a serif
 * quote, the stats and a yellow Play pill); For You is a white card of numbered rows with a
 * "1 / 2 →" page button; the chart opens with a serif "The chart", its tabs become a pill
 * track and its pages get Previous / Next buttons; categories are a 2-column grid of tiles.
 * Every row, tab and link keeps its accessible name and handler.
 */
import { useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { GENRES } from '@/discover/genres';
import { ago, pages, statsLine, type ChartTab } from '@/discover/sections';
import type { Collection, DiscoverItem, EpisodeCard, FollowedShow, SaidItem, ShowCard } from '@/social/api';
import { Artwork } from '@/ui/kit/Artwork';
import { Button } from '@/ui/kit/Button';
import { Card } from '@/ui/kit/Card';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { EpisodeLine, Pager, SectionTitle } from './parts';
import { noun, plural } from '@socialmorning/social-core';

const TAP = { minHeight: hit.min };
const SQUARE = { minHeight: hit.min, minWidth: hit.min };
/** Three tiles to a row (`Home-B` shortcuts); two to a row (`Discover-B` categories). */
const THIRD = { minHeight: hit.min, flexBasis: '30%' as const, flexGrow: 1 };
const HALF = { minHeight: hit.min, flexBasis: '45%' as const, flexGrow: 1 };

type Act = { onOpen: (card: EpisodeCard) => void; onPlay: (card: EpisodeCard) => void };

/** The shortcut tiles under the search bar — three to a row, icon over label. */
export function Shortcuts(props: { items: { label: string; icon: IconName; onPress: () => void }[] }): React.ReactElement {
  const stores = useStores();
  // `palette`, not `c`: the map below names each shortcut `c`.
  const palette = useColours(stores.settings);
  return (
    <Box className="flex-row flex-wrap gap-gap px-screen-x mt-row">
      {props.items.map((c) => (
        <Pressable key={c.label} onPress={c.onPress} accessibilityRole="button" accessibilityLabel={c.label} className="items-center justify-center gap-0.5 bg-surface border border-border rounded-row px-1 py-1.5" style={THIRD}>
          <Icon name={c.icon} size={20} color={palette.accent} />
          <Text className="text-text text-xs font-semibold" numberOfLines={1}>{c.label}</Text>
        </Pressable>
      ))}
    </Box>
  );
}

/** For You — a card of three numbered rows per page; swipe, or tap "1 / 2 →" for the next page. */
export function ForYouSection(props: Act & { rows: { card: EpisodeCard; line: string; index: number }[]; onOpenAt: (card: EpisodeCard, index: number) => void }): React.ReactElement | null {
  const [page, setPage] = useState(0);
  if (props.rows.length === 0) return null;
  const p = pages(props.rows);
  const shown = Math.min(page, p.length - 1);
  return (
    <Box>
      <Box className="flex-row items-end justify-between px-screen-x mt-section mb-gap">
        <Text className="text-text text-lg font-display flex-1" accessibilityRole="header" numberOfLines={1}>For You</Text>
        {p.length > 1 ? (
          <Pressable
            onPress={() => setPage((shown + 1) % p.length)}
            accessibilityRole="button"
            accessibilityLabel={`Next three For You picks, page ${shown + 1} of ${p.length}`}
            className="justify-center pl-row"
            style={SQUARE}
          >
            <Text className="text-accent text-meta font-semibold">{`${shown + 1} / ${p.length} →`}</Text>
          </Pressable>
        ) : null}
      </Box>
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
                label={`${r.card.title}, ${r.card.showTitle}. ${r.line}`}
                onOpen={() => props.onOpenAt(r.card, r.index)}
                onPlay={() => props.onPlay(r.card)}
              />
            ))}
          </Card>
        )}
      </Pager>
    </Box>
  );
}

/** Editor's picks — each a white card: the owner's note as a serif quote, the stats, and Play. */
export function PicksSection(props: Act & { items: DiscoverItem[]; date?: string; onPast?: () => void }): React.ReactElement | null {
  const stores = useStores();
  const c = useColours(stores.settings);
  if (props.items.length === 0) return null;
  return (
    <Box className="gap-row mt-row">
      {props.items.map((p, n) => {
        const stats = statsLine(p.stats);
        return (
          <Card key={p.key} className="mx-screen-x pt-2 pb-row">
            {/* The eyebrow and the past-picks link head the first card only (M12 FR-070: earlier
                days' picks are one tap away). */}
            {n === 0 ? (
              <Box className="flex-row items-center justify-between" style={TAP}>
                <Eyebrow accent className="flex-1">{props.date ? `Editor's picks · ${props.date}` : "Editor's picks"}</Eyebrow>
                {props.onPast ? (
                  <Pressable onPress={props.onPast} accessibilityRole="link" accessibilityLabel="Past picks" className="justify-center pl-row" style={TAP}>
                    <Text className="text-accent text-meta font-semibold">Past picks →</Text>
                  </Pressable>
                ) : null}
              </Box>
            ) : null}
            <Box className={`flex-row gap-row items-start ${n === 0 ? '' : 'pt-row'}`}>
              <Pressable onPress={() => props.onOpen(p.episode)} accessibilityRole="button" accessibilityLabel={`${p.episode.title}, ${p.episode.showTitle}`}>
                <Artwork url={p.episode.imageUrl} size={76} name={p.episode.showTitle} />
              </Pressable>
              <Pressable onPress={() => props.onOpen(p.episode)} className="flex-1 gap-1" accessibilityRole="button" accessibilityLabel={`Open ${p.episode.title}`} style={TAP}>
                <Text className="text-muted text-xs" numberOfLines={1}>{p.episode.showTitle}</Text>
                <Text className="text-text text-title font-display" numberOfLines={3}>{p.episode.title}</Text>
              </Pressable>
            </Box>
            {p.why ? <Text className="text-text text-body font-display-semibold mt-row" numberOfLines={4}>“{p.why}”</Text> : null}
            <Box className="flex-row items-center justify-between gap-row mt-row">
              <Box className="flex-row items-center gap-1 flex-1">
                {stats ? <><Icon name="headset-outline" size={14} color={c.muted} /><Text className="text-muted text-xs" numberOfLines={1}>{stats}</Text></> : null}
              </Box>
              <Button label="Play" accessibilityLabel={`Play ${p.episode.title}`} onPress={() => props.onPlay(p.episode)} />
            </Box>
          </Card>
        );
      })}
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
  if (!current) return null;
  const p = pages(current.rows);
  const first = page <= 0;
  const last = page >= p.length - 1;
  return (
    <Box>
      <Box className="flex-row items-end justify-between px-screen-x mt-section">
        <Text className="text-text text-hero font-display flex-1" accessibilityRole="header" numberOfLines={1}>The chart</Text>
        {/* M12 FR-071: the whole Talked-about ranking, not only the three pages shown here. */}
        {props.onFull ? (
          <Pressable onPress={props.onFull} accessibilityRole="link" accessibilityLabel="Full chart" className="justify-center pl-row" style={TAP}>
            <Text className="text-accent text-meta font-semibold">Full chart →</Text>
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
      <Pager key={current.key} count={p.length} full index={page} onPage={setPage}>
        {(i) => (p[i] ?? []).map((card, j) => (
          <EpisodeLine key={card.id} card={card} rank={i * 3 + j + 1} size={60} divided={j > 0} onOpen={() => props.onOpen(card)} onPlay={() => props.onPlay(card)} />
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

/** Explore by category — genre tiles two to a row; each opens that genre's top shows. */
export function CategoryStrip(props: { onGenre: (id: number) => void; onAll: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <Box className="mt-row">
      <SectionTitle title="Explore by category" action={{ label: 'All', onPress: props.onAll }} />
      <Box className="flex-row flex-wrap gap-gap px-screen-x">
        {GENRES.slice(0, 8).map((g) => (
          <Pressable key={g.id} onPress={() => props.onGenre(g.id)} accessibilityRole="button" accessibilityLabel={g.name} className="flex-row items-center gap-2.5 bg-surface border border-border rounded-row px-row py-1" style={HALF}>
            <Icon name={g.icon} size={20} color={c.accent} />
            {/* M12 FR-008 (B8): two lines before an ellipsis ("Society & Culture" was "Society &…"). */}
            <Text className="text-text text-meta font-semibold flex-1" numberOfLines={2}>{g.name}</Text>
          </Pressable>
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

export const followedShowTiles = (shows: FollowedShow[]) =>
  shows.map((s) => ({ feedUrl: s.feedUrl, title: s.title, ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}), line: `${plural(s.followers, 'listener')} here ${noun(s.followers, 'follows', 'follow')}` }));

/** An owner-curated collection: its title and line, then episode rows with play, in a card. */
export function CollectionSection(props: Act & { collection: Collection }): React.ReactElement {
  const c = props.collection;
  return (
    <Box>
      <SectionTitle title={c.title} />
      {c.subtitle ? <Text className="text-muted text-body px-screen-x mb-row">{c.subtitle}</Text> : null}
      <Card padded={false} className="mx-screen-x px-row">
        {c.items.map((i, n) => <EpisodeLine key={i.key} card={i.episode} size={56} divided={n > 0} {...(i.why ? { line: `“${i.why}”` } : {})} onOpen={() => props.onOpen(i.episode)} onPlay={() => props.onPlay(i.episode)} />)}
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

/** New shows on the chart — a show with only a few episodes, and its latest one. */
export function NewShowsSection(props: Act & { items: { show: ShowCard; episode: EpisodeCard }[] }): React.ReactElement | null {
  if (props.items.length === 0) return null;
  return (
    <Box>
      <SectionTitle title="New shows climbing the chart" />
      <Card padded={false} className="mx-screen-x px-row">
        {props.items.map((n, k) => (
          <EpisodeLine key={n.episode.id} card={n.episode} size={56} divided={k > 0} line={n.show.episodeCount !== undefined ? `${plural(n.show.episodeCount, 'episode')} so far` : 'New on the chart'} onOpen={() => props.onOpen(n.episode)} onPlay={() => props.onPlay(n.episode)} />
        ))}
      </Card>
    </Box>
  );
}

export function MoreCategories(props: { onPress: () => void }): React.ReactElement {
  return (
    <Pressable onPress={props.onPress} accessibilityRole="link" accessibilityLabel="Explore more categories" className="items-center justify-center mt-section" style={TAP}>
      <Text className="text-accent text-meta font-semibold">Explore more categories →</Text>
    </Pressable>
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
