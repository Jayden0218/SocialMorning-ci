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
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable } from '../../src/ui/lib/pressable';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { Toggle } from '../../src/ui/Toggle';
import { Loader } from '../../src/ui/Loader';
import { GENRES } from '../../src/discover/genres';
import { categoryList, type CategorySort } from '../../src/discover/category-list';
import { hit } from '../../src/design';
import { ago } from '../../src/discover/sections';
import { useSafety } from '../../src/safety/context';
import type { CategoryShows } from '../../src/social/api';
import { useSocial } from '../../src/social/context';
import { useStores, useSubscriptionSync } from '../../src/ui/providers';
import { useColours } from '../../src/ui/useColours';
import { Icon } from '../../src/ui/Icon';
import { Artwork } from '../../src/ui/Artwork';
import { Screen } from '../../src/ui/Screen';
import { PageHeader } from '../../src/ui/PageHeader';

const TAP = { minHeight: hit.min };
const TILE = { width: 72, minHeight: 64 };
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

  const strip = useRef<ComponentRef<typeof ScrollView>>(null);
  const tileX = useRef(new Map<number, number>());
  const scrolled = useRef(false);
  const showTile = (id: number, animated: boolean) => {
    const x = tileX.current.get(id);
    if (x !== undefined) strip.current?.scrollTo({ x: Math.max(0, x - 40), animated });
  };
  const pick = (id: number) => { setGenreId(id); setPanel(false); showTile(id, true); };

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
  return (
    <>
    <PageHeader title="Categories" />
    <Screen scroll className="pt-row">
      <Box className="flex-row items-center pb-row">
        <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pl-screen-x pr-row" className="flex-1 -ml-screen-x">
          {GENRES.map((g) => {
            const on = g.id === genreId;
            return (
              <Pressable key={g.id} onPress={() => pick(g.id)}
                onLayout={(e) => { tileX.current.set(g.id, e.nativeEvent.layout.x); if (on && !scrolled.current) { scrolled.current = true; showTile(g.id, false); } }}
                accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={g.name}
                className={`items-center justify-center gap-1 px-1 py-2 rounded-row ${on ? 'bg-primary' : 'bg-surface'}`} style={TILE}>
                <Icon name={g.icon} size={22} color={on ? c.onPrimary : c.text} />
                <Text className={on ? 'text-onPrimary text-xs font-semibold text-center' : 'text-text text-xs text-center'} numberOfLines={1}>{g.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable onPress={() => setPanel((p) => !p)} accessibilityRole="button" accessibilityLabel={panel ? 'Hide all categories' : 'Show all categories'}
          accessibilityState={{ expanded: panel }} className="items-center justify-center" style={ROUND}>
          <Icon name={panel ? 'chevron-up' : 'chevron-down'} size={20} color={c.text} />
        </Pressable>
      </Box>
      {panel ? (
        <Box className="flex-row flex-wrap gap-row pb-section">
          {GENRES.map((g) => {
            const on = g.id === genreId;
            return (
              <Pressable key={g.id} onPress={() => pick(g.id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={g.name}
                className={`rounded-row flex-row items-center gap-2 px-row ${on ? 'bg-primary' : 'bg-surface'}`} style={TAP}>
                <Icon name={g.icon} size={20} color={on ? c.onPrimary : c.text} />
                <Text className={on ? 'text-onPrimary text-sm font-semibold' : 'text-text text-sm font-semibold'}>{g.name}</Text>
              </Pressable>
            );
          })}
        </Box>
      ) : null}
      <Box className="flex-row items-center gap-2 pb-row">
        {(['all', 'newest'] as const).map((k) => {
          const on = sort === k;
          return (
            <Pressable key={k} onPress={() => setSort(k)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={k === 'all' ? 'All, chart order' : 'Newest episodes first'}
              className={`justify-center px-row rounded-pill ${on ? 'bg-primary' : 'bg-surface'}`} style={TAP}>
              <Text className={on ? 'text-onPrimary text-sm font-semibold' : 'text-text text-sm'}>{k === 'all' ? 'All' : 'Newest'}</Text>
            </Pressable>
          );
        })}
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
      {shows.map((s) => {
        const on = subscribed.has(s.feedUrl);
        const ep = s.latestEpisode;
        return (
          <Box key={s.feedUrl} className="flex-row items-start gap-row py-row border-b-hairline border-separator">
            <Pressable
              onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })}
              accessibilityRole="button"
              accessibilityLabel={`${s.title}, ${s.author}${ep ? `. Newest: ${ep.title}` : ''}`}
              className="flex-1 flex-row items-start gap-row"
              style={TAP}
            >
              <Artwork url={s.imageUrl} size={64} rounded="row" name={s.title} />
              <Box className="flex-1">
                <Text className="text-text text-sm font-bold" numberOfLines={2}>{s.title}</Text>
                <Text className="text-muted text-xs" numberOfLines={1}>{s.author}</Text>
                {ep ? (
                  <Box className="flex-row items-start gap-1 bg-surface rounded-row p-row mt-2">
                    <Icon name="play-circle-outline" size={14} color={c.muted} />
                    <Text className="flex-1 text-muted text-xs" numberOfLines={2}>
                      {ep.publishedAt ? `${ago(ep.publishedAt, now)} · ` : ''}{ep.title}
                    </Text>
                  </Box>
                ) : null}
              </Box>
            </Pressable>
            <Pressable onPress={() => toggleSubscription(s.feedUrl)} accessibilityRole="button"
              accessibilityLabel={on ? `Unsubscribe from ${s.title}` : `Subscribe to ${s.title}`} accessibilityState={{ selected: on }}
              className={`items-center justify-center rounded-pill ${on ? 'bg-surface' : 'bg-primary'}`} style={ROUND}>
              <Icon name={on ? 'checkmark' : 'add'} size={22} color={on ? c.muted : c.onPrimary} />
            </Pressable>
          </Box>
        );
      })}
    </Screen>
    </>
  );
}
