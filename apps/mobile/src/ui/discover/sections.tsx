/**
 * The sections of the redesigned Discover (M10, owner 2026-09-27), top to bottom in the
 * order of the reference screens. Each takes only what it draws and a way to open or
 * play; `app/(tabs)/index.tsx` decides which ones appear (`src/discover/sections.ts`).
 *
 * Two sections of the reference are not here, on purpose: video podcasts (the player
 * plays audio only) and paid shows (the app has none — a banner would lead nowhere).
 */
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { colour, hit } from '../../design';
import { Icon, type IconName } from '../Icon';
import { GENRES } from '../../discover/genres';
import { ago, pages, statsLine, type ChartTab } from '../../discover/sections';
import type { Collection, DiscoverItem, EpisodeCard, FollowedShow, SaidItem, ShowCard } from '../../social/api';
import { Artwork } from '../Artwork';
import { EpisodeLine, Pager, PlayButton, SectionTitle } from './parts';

const TAP = { minHeight: hit.min };

type Act = { onOpen: (card: EpisodeCard) => void; onPlay: (card: EpisodeCard) => void };

/** The four shortcut chips under the search bar. */
export function Shortcuts(props: { items: { label: string; icon: IconName; onPress: () => void }[] }): React.ReactElement {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-screen-x gap-row" className="mt-row">
      {props.items.map((c) => (
        <Pressable key={c.label} onPress={c.onPress} accessibilityRole="button" accessibilityLabel={c.label} className="flex-row items-center gap-2 border border-separator rounded-row px-row" style={TAP}>
          <Icon name={c.icon} size={18} color={colour.text} />
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
    <View>
      <SectionTitle title="For You" />
      <Pager count={p.length}>
        {(i) => (p[i] ?? []).map((r) => (
          <EpisodeLine key={r.card.id} card={r.card} line={r.line} label={`${r.card.title}, ${r.card.showTitle}. ${r.line}`} onOpen={() => props.onOpenAt(r.card, r.index)} onPlay={() => props.onPlay(r.card)} />
        ))}
      </Pager>
    </View>
  );
}

/** Editor's picks — the owner's note in a quote box, and how many listened and talked. */
export function PicksSection(props: Act & { items: DiscoverItem[]; date?: string }): React.ReactElement | null {
  if (props.items.length === 0) return null;
  return (
    <View>
      <SectionTitle title={props.date ? `Editor's picks · ${props.date}` : "Editor's picks"} />
      {props.items.map((p) => {
        const stats = statsLine(p.stats);
        return (
          <View key={p.key} className="flex-row gap-row px-screen-x mb-section">
            <Pressable onPress={() => props.onOpen(p.episode)} accessibilityRole="button" accessibilityLabel={`${p.episode.title}, ${p.episode.showTitle}`}>
              <Artwork url={p.episode.imageUrl} size={88} rounded="row" />
            </Pressable>
            <View className="flex-1">
              <View className="flex-row items-start">
                <Pressable onPress={() => props.onOpen(p.episode)} className="flex-1" accessibilityRole="button" accessibilityLabel={`Open ${p.episode.title}`}>
                  <Text className="text-muted text-xs" numberOfLines={1}>{p.episode.showTitle}</Text>
                  <Text className="text-text text-sm font-semibold" numberOfLines={3}>{p.episode.title}</Text>
                </Pressable>
                <PlayButton title={p.episode.title} onPress={() => props.onPlay(p.episode)} />
              </View>
              {p.why ? (
                <View className="bg-surface rounded-row p-row mt-2">
                  <Text className="text-muted text-sm" numberOfLines={4}>“{p.why}”</Text>
                </View>
              ) : null}
              {stats ? <View className="flex-row items-center gap-1 mt-2"><Icon name="headset-outline" size={14} color={colour.muted} /><Text className="text-muted text-xs">{stats}</Text></View> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** The chart — three tabs (top, talked about, new shows), numbered rows in pages of three. */
export function ChartSection(props: Act & { tabs: ChartTab[] }): React.ReactElement | null {
  const [tab, setTab] = useState(0);
  const [page, setPage] = useState(0);
  const current = props.tabs[Math.min(tab, props.tabs.length - 1)];
  if (!current) return null;
  const p = pages(current.rows);
  return (
    <View>
      <View className="flex-row items-center gap-section px-screen-x mt-section mb-row">
        {props.tabs.map((t, i) => (
          <Pressable key={t.key} onPress={() => { setTab(i); setPage(0); }} accessibilityRole="tab" accessibilityState={{ selected: i === tab }} accessibilityLabel={`${t.label} chart`} className="justify-center" style={TAP}>
            <Text className={i === tab ? 'text-accent text-base font-bold' : 'text-muted text-base'}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <Pager key={current.key} count={p.length} onPage={setPage}>
        {(i) => (p[i] ?? []).map((card, j) => (
          <EpisodeLine key={card.id} card={card} rank={i * 3 + j + 1} size={56} onOpen={() => props.onOpen(card)} onPlay={() => props.onPlay(card)} />
        ))}
      </Pager>
      {p.length > 1 ? (
        <View className="flex-row gap-2 px-screen-x mt-row" accessibilityLabel={`Page ${page + 1} of ${p.length}`} accessible>
          {p.map((_, i) => <View key={i} className={`flex-1 h-1 rounded-pill ${i === page ? 'bg-primary' : 'bg-surface'}`} />)}
        </View>
      ) : null}
    </View>
  );
}

/** Explore by category — a strip of genre tiles; each opens that genre's top shows. */
export function CategoryStrip(props: { onGenre: (id: number) => void; onAll: () => void }): React.ReactElement {
  return (
    <View className="bg-surface py-row mt-section">
      <SectionTitle title="Explore by category" action={{ label: 'All', onPress: props.onAll }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-screen-x gap-row">
        {GENRES.slice(0, 8).map((g) => (
          <Pressable key={g.id} onPress={() => props.onGenre(g.id)} accessibilityRole="button" accessibilityLabel={g.name} className="bg-background rounded-row items-center justify-center px-row py-row w-24">
            <Text className="text-text text-xs font-semibold text-center" numberOfLines={1}>{g.name}</Text>
            <View className="mt-1"><Icon name={g.icon} size={24} color={colour.text} /></View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Three show tiles — artwork, name, one muted line. */
export function ShowTiles(props: { title: string; shows: { feedUrl: string; title: string; imageUrl?: string; line?: string }[]; onShow: (feedUrl: string) => void; badge?: number; boxed?: boolean }): React.ReactElement | null {
  if (props.shows.length === 0) return null;
  return (
    <View className={props.boxed ? 'mx-row mt-section border border-separator rounded-artwork pb-row' : ''}>
      <SectionTitle title={props.title} {...(props.badge !== undefined ? { badge: props.badge } : {})} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-screen-x gap-row">
        {props.shows.map((s) => (
          <Pressable key={s.feedUrl} onPress={() => props.onShow(s.feedUrl)} accessibilityRole="button" accessibilityLabel={s.line ? `${s.title}. ${s.line}` : s.title} className="w-32">
            <Artwork url={s.imageUrl} size={128} rounded="row" />
            <Text className="text-text text-sm font-semibold mt-2" numberOfLines={1}>{s.title}</Text>
            {s.line ? <Text className="text-muted text-xs" numberOfLines={2}>{s.line}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export const popularShowTiles = (shows: ShowCard[]) => shows.map((s) => ({ feedUrl: s.feedUrl, title: s.title, ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}), line: s.author }));

export const followedShowTiles = (shows: FollowedShow[]) =>
  shows.map((s) => ({ feedUrl: s.feedUrl, title: s.title, ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}), line: `${s.followers} listener${s.followers === 1 ? '' : 's'} here follow` }));

/** An owner-curated collection: its title and line, then episode rows with play. */
export function CollectionSection(props: Act & { collection: Collection }): React.ReactElement {
  const c = props.collection;
  return (
    <View>
      <SectionTitle title={c.title} />
      {c.subtitle ? <Text className="text-muted text-sm px-screen-x -mt-1 mb-row">{c.subtitle}</Text> : null}
      <View className="px-screen-x">
        {c.items.map((i) => <EpisodeLine key={i.key} card={i.episode} {...(i.why ? { line: `“${i.why}”` } : {})} onOpen={() => props.onOpen(i.episode)} onPlay={() => props.onPlay(i.episode)} />)}
      </View>
    </View>
  );
}

/**
 * What listeners said — recent comments, each with its episode. No names: Discover never
 * names a listener (M5 guard G6), so a card says "A listener".
 */
export function SaidSection(props: Act & { items: SaidItem[]; now: number }): React.ReactElement | null {
  if (props.items.length === 0) return null;
  return (
    <View>
      <SectionTitle title="What listeners said" />
      <Pager count={props.items.length}>
        {(i) => {
          const s = props.items[i];
          if (!s) return null;
          return (
            <View className="bg-surface rounded-artwork p-section">
              <Text className="text-muted text-xs">{`A listener · ${ago(s.createdAt, props.now)}`}</Text>
              <Text className="text-accent text-sm text-center my-section" numberOfLines={4}>{s.body}</Text>
              <View className="border-t-hairline border-separator pt-row">
                <EpisodeLine card={s.episode} size={44} onOpen={() => props.onOpen(s.episode)} onPlay={() => props.onPlay(s.episode)} />
              </View>
            </View>
          );
        }}
      </Pager>
    </View>
  );
}

/** New shows on the chart — a show with only a few episodes, and its latest one. */
export function NewShowsSection(props: Act & { items: { show: ShowCard; episode: EpisodeCard }[] }): React.ReactElement | null {
  if (props.items.length === 0) return null;
  return (
    <View>
      <SectionTitle title="New shows climbing the chart" />
      <View className="px-screen-x">
        {props.items.map((n) => (
          <EpisodeLine key={n.episode.id} card={n.episode} line={n.show.episodeCount !== undefined ? `${n.show.episodeCount} episode${n.show.episodeCount === 1 ? '' : 's'} so far` : 'New on the chart'} onOpen={() => props.onOpen(n.episode)} onPlay={() => props.onPlay(n.episode)} />
        ))}
      </View>
    </View>
  );
}

export function MoreCategories(props: { onPress: () => void }): React.ReactElement {
  return (
    <Pressable onPress={props.onPress} accessibilityRole="link" accessibilityLabel="Explore more categories" className="items-center justify-center mt-section" style={TAP}>
      <Text className="text-muted text-sm">Explore more categories →</Text>
    </Pressable>
  );
}
