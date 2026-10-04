// Top shows in one category, with a category strip, sort, filter, subscribe buttons.
/**
 * One category (M10): the genre's top shows from Apple's chart, through the server
 * (`GET /v1/categories/:id`, cached there). Tapping a show opens its page. M12 FR-072: a strip
 * of every genre along the top switches in place (no new page per tap), and each row names the
 * show's newest episode.
 * Owner, 2026-10-01: Discover's "Categories" opens here (on the first genre) instead of the
 * page of choices; the page is titled "Categories" and the strip scrolls to the chosen genre.
 * Owner, 2026-10-01 (after the reference's category page): the strip is icon tiles with a
 * chevron that opens every genre as a grid; "All" / "Newest" chips and a "Not subscribed only"
 * switch sit under it; rows lose the rank number, show the newest episode in a grey box, and
 * carry a round subscribe button — the only subscribing here is the listener's own tap.
 *
 * M17 T058 (`Category-B`): "Categories" sits small in the back row and the chosen genre is the
 * serif page title, with the chevron (every genre as a grid) beside it; the strip is plain
 * words underlined in yellow; All / Newest are a pill track; the first show is a wide white
 * card and the rest are half-width cards, subscribe round in each card's corner. Same genres,
 * sort, filter, subscribe and show links; the strip still scrolls to the chosen genre.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Toggle } from '@/ui/kit/Toggle';
import { Loader } from '@/ui/kit/Loader';
import { GENRES } from '@/discover/genres';
import { categoryList, type CategorySort } from '@/discover/category-list';
import { hit } from '@/design';
import { ago } from '@/discover/sections';
import { useSafety } from '@/safety/context';
import type { CategoryShows, ShowCard } from '@/social/api';
import { useSocial } from '@/social/context';
import { useStores, useSubscriptionSync } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { Icon } from '@/ui/kit/Icon';
import { Artwork } from '@/ui/kit/Artwork';
import { Card } from '@/ui/kit/Card';
import { Screen } from '@/ui/kit/Screen';
import { PageHeader } from '@/ui/kit/PageHeader';

const TAP = { minHeight: hit.min };
const ROUND = { width: hit.min, height: hit.min };
type State = { kind: 'loading' } | { kind: 'ok'; body: CategoryShows } | { kind: 'error' };

export default function CategoryScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ id: string }>();
  const [genreId, setGenreId] = useState(Number(params.id));
  const router = useRouter();
  const { api } = useSocial();
  const { hiddenFeeds } = useSafety();
  const stores = useStores();
  const subscriptionSync = useSubscriptionSync();
  const c = useColours(stores.settings);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [sort, setSort] = useState<CategorySort>('all');
  const [notSubscribedOnly, setNotSubscribedOnly] = useState(false);
  const [panel, setPanel] = useState(false);
  const readSubscribed = useCallback(() => new Set(stores.subscriptions.list().map((s) => s.feedUrl)), [stores]);
  const [subscribed, setSubscribed] = useState<Set<string>>(readSubscribed);
  // A show page opened from here may subscribe or unsubscribe; re-read on coming back.
  useFocusEffect(useCallback(() => { setSubscribed(readSubscribed()); }, [readSubscribed]));

  const pick = (id: number) => { setGenreId(id); setPanel(false); };

  useEffect(() => {
    let live = true;
    setState({ kind: 'loading' });
    api.category(genreId).then((body) => { if (live) setState({ kind: 'ok', body }); }, () => { if (live) setState({ kind: 'error' }); });
    return () => { live = false; };
  }, [api, genreId]);

  // The same store calls and push as the show page's Subscribe (app/show/[feedUrl].tsx,
  // toggleSubscription): local write first, the sync is fire-and-forget (M8 US1).
  const toggleSubscription = (feedUrl: string) => {
    if (stores.subscriptions.has(feedUrl)) stores.subscriptions.remove(feedUrl);
    else stores.subscriptions.add(feedUrl, Date.now());
    subscriptionSync.push();
    setSubscribed(readSubscribed());
  };

  const now = Date.now();
  const visible = state.kind === 'ok' ? state.body.shows.filter((s) => !hiddenFeeds.has(s.feedUrl)) : [];
  const shows = categoryList(visible, { sort, notSubscribedOnly, subscribed });
  const genreName = GENRES.find((g) => g.id === genreId)?.name ?? (state.kind === 'ok' ? state.body.name : '');
  const [lead, ...rest] = shows;
  const pairs: ShowCard[][] = [];
  for (let i = 0; i < rest.length; i += 2) pairs.push(rest.slice(i, i + 2));

  /** One show: the first is the wide card, the rest half-width; subscribe sits top right on both. */
  const showCard = (s: ShowCard, wide: boolean): React.ReactElement => {
    const on = subscribed.has(s.feedUrl);
    const ep = s.latestEpisode;
    return (
      <Card key={s.feedUrl} padded={false} className={wide ? 'p-section mb-row' : 'flex-1 p-row'}>
        <Pressable
          onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })}
          accessibilityRole="button"
          accessibilityLabel={`${s.title}, ${s.author}${ep ? `. Newest: ${ep.title}` : ''}`}
          className={wide ? 'flex-row items-center gap-section pr-12' : 'gap-1'}
          style={TAP}
        >
          <Artwork url={s.imageUrl} size={wide ? 100 : 72} rounded="row" name={s.title} />
          <Box className={wide ? 'flex-1' : ''}>
            <Text className={wide ? 'text-text text-base font-display' : 'text-text text-body font-bold mt-1'} numberOfLines={2}>{s.title}</Text>
            <Text className="text-muted text-xs" numberOfLines={1}>{s.author}</Text>
            {ep ? (
              <Box className={wide ? 'flex-row items-start gap-1 mt-2' : 'flex-row items-start gap-1 bg-background rounded-row p-2 mt-2'}>
                {wide ? <Icon name="play-circle-outline" size={14} color={c.muted} /> : null}
                <Text className="flex-1 text-muted text-xs" numberOfLines={2}>
                  {ep.publishedAt ? `${ago(ep.publishedAt, now)} · ` : ''}{ep.title}
                </Text>
              </Box>
            ) : null}
          </Box>
        </Pressable>
        <Box className={wide ? 'absolute top-2 right-2' : 'absolute top-1 right-1'}>
          <Pressable onPress={() => toggleSubscription(s.feedUrl)} accessibilityRole="button"
            accessibilityLabel={on ? `Unsubscribe from ${s.title}` : `Subscribe to ${s.title}`} accessibilityState={{ selected: on }}
            className={`items-center justify-center rounded-pill ${on ? 'bg-surface border border-border' : 'bg-primary'}`} style={ROUND}>
            <Icon name={on ? 'checkmark' : 'add'} size={22} color={on ? c.muted : c.onPrimary} />
          </Pressable>
        </Box>
      </Card>
    );
  };

  return (
    <>
    <PageHeader middle={<Text className="text-text text-title font-bold" numberOfLines={1}>Categories</Text>} />
    <Screen scroll>
      <Box className="flex-row items-center gap-1">
        <Text className="shrink text-text text-display font-display" numberOfLines={1} accessibilityRole="header">{genreName}</Text>
        <Pressable onPress={() => setPanel((p) => !p)} accessibilityRole="button" accessibilityLabel={panel ? 'Hide all categories' : 'Show all categories'}
          accessibilityState={{ expanded: panel }} className="items-center justify-center" style={ROUND}>
          <Icon name={panel ? 'chevron-up' : 'chevron-down'} size={20} color={c.accent} />
        </Pressable>
      </Box>
      {panel ? (
        <Box className="flex-row flex-wrap gap-2 pt-row">
          {GENRES.map((g) => {
            const on = g.id === genreId;
            return (
              <Pressable key={g.id} onPress={() => pick(g.id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={g.name}
                className={`rounded-pill flex-row items-center gap-2 px-row ${on ? 'bg-primary' : 'bg-surface border border-border'}`} style={TAP}>
                <Icon name={g.icon} size={18} color={on ? c.onPrimary : c.text} />
                <Text className={on ? 'text-onPrimary text-body font-semibold' : 'text-text text-body font-semibold'}>{g.name}</Text>
              </Pressable>
            );
          })}
        </Box>
      ) : null}
      {/* Owner, 2026-10-04: no row of category tabs under the title — the title's chevron opens
          the full list instead. */}
      <Box className="flex-row items-center gap-2 pb-row">
        <Box className="flex-row gap-1 p-1 bg-track rounded-pill">
          {(['all', 'newest'] as const).map((k) => {
            const on = sort === k;
            return (
              <Pressable key={k} onPress={() => setSort(k)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={k === 'all' ? 'All, chart order' : 'Newest episodes first'}
                className={`justify-center px-section rounded-pill ${on ? 'bg-primary' : ''}`} style={TAP}>
                <Text className={on ? 'text-onPrimary text-body font-bold' : 'text-muted text-body'}>{k === 'all' ? 'All' : 'Newest'}</Text>
              </Pressable>
            );
          })}
        </Box>
        <Box className="flex-1" />
        <Box className="flex-row items-center gap-2" style={TAP}>
          <Text className="text-muted text-xs">Not subscribed only</Text>
          <Toggle value={notSubscribedOnly} onChange={setNotSubscribedOnly} label="Not subscribed only" />
        </Box>
      </Box>
      {state.kind === 'loading' ? <Loader className="my-section" /> : null}
      {state.kind === 'error' ? <Text className="text-muted text-sm">Couldn't load this category right now.</Text> : null}
      {state.kind === 'ok' && state.body.stale ? <Text className="text-accent text-sm mb-row">Couldn't refresh — showing an earlier list.</Text> : null}
      {state.kind === 'ok' && shows.length === 0 ? (
        <Text className="text-muted text-sm">{visible.length > 0 && notSubscribedOnly ? "You're subscribed to every show here." : 'No shows here yet.'}</Text>
      ) : null}
      {lead ? showCard(lead, true) : null}
      {pairs.map((pair) => (
        <Box key={pair.map((s) => s.feedUrl).join('|')} className="flex-row gap-row mb-row">
          {pair.map((s) => showCard(s, false))}
          {pair.length === 1 ? <Box className="flex-1" /> : null}
        </Box>
      ))}
    </Screen>
    </>
  );
}
