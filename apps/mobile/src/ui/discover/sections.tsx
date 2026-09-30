/**
 * The sections of the redesigned Discover (M10, owner 2026-09-27), top to bottom in the
 * order of the reference screens. Each takes only what it draws and a way to open or
 * play; `app/(tabs)/index.tsx` decides which ones appear (`src/discover/sections.ts`).
 *
 * Two sections of the reference are not here, on purpose: video podcasts (the player
 * plays audio only) and paid shows (the app has none — a banner would lead nowhere).
 */
import { useState } from 'react';
import { Pressable } from '../lib/pressable';
import { ScrollView } from '../lib/scroll-view';
import { Text } from '../lib/text';
import { Box } from '../lib/box';
import { colour, hit } from '../../design';
import { useStores } from '../providers';
import { useColours } from '../useColours';
import { Icon, type IconName } from '../Icon';
import { GENRES } from '../../discover/genres';
import { ago, pages, statsLine, type ChartTab } from '../../discover/sections';
import type { Collection, DiscoverItem, EpisodeCard, FollowedShow, SaidItem, ShowCard } from '../../social/api';
import { Artwork } from '../Artwork';
import { EpisodeLine, Pager, PlayButton, SectionTitle } from './parts';
import { noun, plural } from '@socialmorning/social-core';

const TAP = { minHeight: hit.min };

type Act = { onOpen: (card: EpisodeCard) => void; onPlay: (card: EpisodeCard) => void };

/** The four shortcut chips under the search bar. */
export function Shortcuts(props: { items: { label: string; icon: IconName; onPress: () => void }[] }): React.ReactElement {
  const stores = useStores();
  // `palette`, not `c`: the map below names each shortcut `c`.
  const palette = useColours(stores.settings);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-screen-x gap-row" className="mt-row">
      {props.items.map((c) => (
        <Pressable key={c.label} onPress={c.onPress} accessibilityRole="button" accessibilityLabel={c.label} className="flex-row items-center gap-2 border border-separator rounded-row px-row" style={TAP}>
          <Icon name={c.icon} size={18} color={palette.text} />
          <Text className="text-text text-sm font-semibold">{c.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** For You — pages of three rows, swiped sideways. */
export function ForYouSection(props: Act & { rows: { card: EpisodeCard; line: string; index: number }[]; onOpenAt: (card: EpisodeCard, index: number) => void }): React.ReactElement | null {
  if (props.rows.length === 0) return null;
  const p = pages(props.rows);
  return (
    <Box>
      <SectionTitle title="For You" />
      <Pager count={p.length}>
        {(i) => (p[i] ?? []).map((r) => (
          <EpisodeLine key={r.card.id} card={r.card} line={r.line} label={`${r.card.title}, ${r.card.showTitle}. ${r.line}`} onOpen={() => props.onOpenAt(r.card, r.index)} onPlay={() => props.onPlay(r.card)} />
        ))}
      </Pager>
    </Box>
  );
}

/** Editor's picks — the owner's note in a quote box, and how many listened and talked. */
export function PicksSection(props: Act & { items: DiscoverItem[]; date?: string; onPast?: () => void }): React.ReactElement | null {
  const stores = useStores();
  const c = useColours(stores.settings);
  if (props.items.length === 0) return null;
  return (
    <Box>
      {/* M12 FR-070: earlier days' picks are one tap away. */}
      <SectionTitle title={props.date ? `Editor's picks · ${props.date}` : "Editor's picks"} {...(props.onPast ? { action: { label: 'Past picks', onPress: props.onPast } } : {})} />
      {props.items.map((p) => {
        const stats = statsLine(p.stats);
        return (
          <Box key={p.key} className="flex-row gap-row px-screen-x mb-section">
            <Pressable onPress={() => props.onOpen(p.episode)} accessibilityRole="button" accessibilityLabel={`${p.episode.title}, ${p.episode.showTitle}`}>
              <Artwork url={p.episode.imageUrl} size={88} rounded="row" name={p.episode.showTitle} />
            </Pressable>
            <Box className="flex-1">
              <Box className="flex-row items-start">
                <Pressable onPress={() => props.onOpen(p.episode)} className="flex-1" accessibilityRole="button" accessibilityLabel={`Open ${p.episode.title}`}>
                  <Text className="text-muted text-xs" numberOfLines={1}>{p.episode.showTitle}</Text>
                  <Text className="text-text text-sm font-semibold" numberOfLines={3}>{p.episode.title}</Text>
                </Pressable>
                <PlayButton title={p.episode.title} onPress={() => props.onPlay(p.episode)} />
              </Box>
              {p.why ? (
                <Box className="bg-surface rounded-row p-row mt-2">
                  <Text className="text-muted text-sm" numberOfLines={4}>“{p.why}”</Text>
                </Box>
              ) : null}
              {stats ? <Box className="flex-row items-center gap-1 mt-2"><Icon name="headset-outline" size={14} color={c.muted} /><Text className="text-muted text-xs">{stats}</Text></Box> : null}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/** The chart — three tabs (top, talked about, new shows), numbered rows in pages of three. */
export function ChartSection(props: Act & { tabs: ChartTab[]; onFull?: () => void }): React.ReactElement | null {
  const [tab, setTab] = useState(0);
  const [page, setPage] = useState(0);
  const current = props.tabs[Math.min(tab, props.tabs.length - 1)];
  if (!current) return null;
  const p = pages(current.rows);
  return (
    <Box>
      <Box className="flex-row items-center gap-section px-screen-x mt-section mb-row">
        {props.tabs.map((t, i) => (
          <Pressable key={t.key} onPress={() => { setTab(i); setPage(0); }} accessibilityRole="tab" accessibilityState={{ selected: i === tab }} accessibilityLabel={`${t.label} chart`} className="justify-center" style={TAP}>
            <Text className={i === tab ? 'text-accent text-base font-bold' : 'text-muted text-base'}>{t.label}</Text>
          </Pressable>
        ))}
        {/* M12 FR-071: the whole Talked-about ranking, not only the three pages shown here. */}
        {props.onFull ? (
          <Pressable onPress={props.onFull} accessibilityRole="link" accessibilityLabel="Full chart" className="justify-center ml-auto pl-row" style={TAP}>
            <Text className="text-muted text-xs">Full chart →</Text>
          </Pressable>
        ) : null}
      </Box>
      <Pager key={current.key} count={p.length} onPage={setPage}>
        {(i) => (p[i] ?? []).map((card, j) => (
          <EpisodeLine key={card.id} card={card} rank={i * 3 + j + 1} size={56} onOpen={() => props.onOpen(card)} onPlay={() => props.onPlay(card)} />
        ))}
      </Pager>
      {p.length > 1 ? (
        <Box className="flex-row gap-2 px-screen-x mt-row" accessibilityLabel={`Page ${page + 1} of ${p.length}`} accessible>
          {p.map((_, i) => <Box key={i} className={`flex-1 h-1 rounded-pill ${i === page ? 'bg-primary' : 'bg-surface'}`} />)}
        </Box>
      ) : null}
    </Box>
  );
}

/** Explore by category — a strip of genre tiles; each opens that genre's top shows. */
export function CategoryStrip(props: { onGenre: (id: number) => void; onAll: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <Box className="bg-surface py-row mt-section">
      <SectionTitle title="Explore by category" action={{ label: 'All', onPress: props.onAll }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-screen-x gap-row">
        {GENRES.slice(0, 8).map((g) => (
          <Pressable key={g.id} onPress={() => props.onGenre(g.id)} accessibilityRole="button" accessibilityLabel={g.name} className="bg-background rounded-row items-center justify-center px-row py-row w-24">
            {/* M12 FR-008 (B8): two lines before an ellipsis ("Society & Culture" was "Society &…"). */}
            <Text className="text-text text-xs font-semibold text-center min-h-8" numberOfLines={2}>{g.name}</Text>
            <Box className="mt-1"><Icon name={g.icon} size={24} color={c.text} /></Box>
          </Pressable>
        ))}
      </ScrollView>
    </Box>
  );
}

/** Three show tiles — artwork, name, one muted line. */
export function ShowTiles(props: { title: string; shows: { feedUrl: string; title: string; imageUrl?: string; line?: string }[]; onShow: (feedUrl: string) => void; badge?: number; boxed?: boolean }): React.ReactElement | null {
  if (props.shows.length === 0) return null;
  return (
    <Box className={props.boxed ? 'mx-screen-x mt-section border border-separator rounded-artwork pb-row' : ''}>
      <SectionTitle title={props.title} {...(props.badge !== undefined ? { badge: props.badge } : {})} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-screen-x gap-row">
        {props.shows.map((s) => (
          <Pressable key={s.feedUrl} onPress={() => props.onShow(s.feedUrl)} accessibilityRole="button" accessibilityLabel={s.line ? `${s.title}. ${s.line}` : s.title} className="w-32">
            <Artwork url={s.imageUrl} size={128} rounded="row" name={s.title} />
            <Text className="text-text text-sm font-semibold mt-2" numberOfLines={2}>{s.title}</Text>
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

/** An owner-curated collection: its title and line, then episode rows with play. */
export function CollectionSection(props: Act & { collection: Collection }): React.ReactElement {
  const c = props.collection;
  return (
    <Box>
      <SectionTitle title={c.title} />
      {c.subtitle ? <Text className="text-muted text-sm px-screen-x -mt-1 mb-row">{c.subtitle}</Text> : null}
      <Box className="px-screen-x">
        {c.items.map((i) => <EpisodeLine key={i.key} card={i.episode} {...(i.why ? { line: `“${i.why}”` } : {})} onOpen={() => props.onOpen(i.episode)} onPlay={() => props.onPlay(i.episode)} />)}
      </Box>
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
            <Box className="bg-surface rounded-artwork p-section">
              <Text className="text-muted text-xs">{`A listener · ${ago(s.createdAt, props.now)}`}</Text>
              <Text className="text-accent text-sm text-center my-section" numberOfLines={4}>{s.body}</Text>
              <Box className="border-t-hairline border-separator pt-row">
                <EpisodeLine card={s.episode} size={44} onOpen={() => props.onOpen(s.episode)} onPlay={() => props.onPlay(s.episode)} />
              </Box>
            </Box>
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
      <Box className="px-screen-x">
        {props.items.map((n) => (
          <EpisodeLine key={n.episode.id} card={n.episode} line={n.show.episodeCount !== undefined ? `${plural(n.show.episodeCount, 'episode')} so far` : 'New on the chart'} onOpen={() => props.onOpen(n.episode)} onPlay={() => props.onPlay(n.episode)} />
        ))}
      </Box>
    </Box>
  );
}

export function MoreCategories(props: { onPress: () => void }): React.ReactElement {
  return (
    <Pressable onPress={props.onPress} accessibilityRole="link" accessibilityLabel="Explore more categories" className="items-center justify-center mt-section" style={TAP}>
      <Text className="text-muted text-sm">Explore more categories →</Text>
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
          <Pressable key={i.key} onPress={() => props.onOpen(i.episode)} accessibilityRole="button" accessibilityLabel={`Video: ${i.episode.title}, ${i.episode.showTitle}`} className="w-60 bg-surface rounded-artwork overflow-hidden">
            <Artwork url={i.episode.imageUrl} size={240} rounded="row" name={i.episode.showTitle} />
            <Box className="p-row">
              <Text className="text-text text-sm font-semibold" numberOfLines={2}>{i.episode.title}</Text>
              <Text className="text-muted text-xs" numberOfLines={1}>{`▶ Video · ${i.episode.showTitle}`}</Text>
            </Box>
          </Pressable>
        ))}
      </ScrollView>
    </Box>
  );
}
