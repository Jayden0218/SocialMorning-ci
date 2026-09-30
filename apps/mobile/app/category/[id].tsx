/**
 * One category (M10): the genre's top shows from Apple's chart, through the server
 * (`GET /v1/categories/:id`, cached there). Tapping a show opens its page; nothing is
 * subscribed on the listener's behalf. M12 FR-072: a strip of every genre along the top
 * switches in place (no new page per tap), and each row names the show's newest episode.
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable } from '../../src/ui/lib/pressable';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { Loader } from '../../src/ui/Loader';
import { GENRES, genreById } from '../../src/discover/genres';
import { hit } from '../../src/design';
import { ago } from '../../src/discover/sections';
import { useSafety } from '../../src/safety/context';
import type { CategoryShows } from '../../src/social/api';
import { useSocial } from '../../src/social/context';
import { Artwork } from '../../src/ui/Artwork';
import { Screen } from '../../src/ui/Screen';

const TAP = { minHeight: hit.min };
type State = { kind: 'loading' } | { kind: 'ok'; body: CategoryShows } | { kind: 'error' };

export default function CategoryScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ id: string }>();
  const [genreId, setGenreId] = useState(Number(params.id));
  const strip = useRef<ScrollView>(null);
  const placed = useRef(false);
  const genre = genreById(genreId);
  const router = useRouter();
  const { api } = useSocial();
  const { hiddenFeeds } = useSafety();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    setState({ kind: 'loading' });
    api.category(genreId).then((body) => { if (live) setState({ kind: 'ok', body }); }, () => { if (live) setState({ kind: 'error' }); });
    return () => { live = false; };
  }, [api, genreId]);

  const now = Date.now();
  const shows = state.kind === 'ok' ? state.body.shows.filter((s) => !hiddenFeeds.has(s.feedUrl)) : [];
  return (
    <Screen scroll className="pt-row">
      <Stack.Screen options={{ title: genre?.name ?? 'Category' }} />
      {/* Phone walk 2026-09-30: a genre far along the strip opened off-screen; the chosen chip scrolls into view once. */}
      <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-row pb-row" className="-mx-screen-x px-screen-x">
        {GENRES.map((g) => {
          const on = g.id === genreId;
          return (
            <Pressable key={g.id} onPress={() => setGenreId(g.id)} onLayout={on && !placed.current ? (e) => { placed.current = true; strip.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - 20), animated: false }); } : undefined} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={g.name}
              className={`justify-center px-section rounded-pill ${on ? 'bg-primary' : 'bg-surface'}`} style={TAP}>
              <Text className={on ? 'text-onPrimary text-sm font-semibold' : 'text-text text-sm'}>{g.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {state.kind === 'loading' ? <Loader className="my-section" /> : null}
      {state.kind === 'error' ? <Text className="text-muted text-sm">Couldn't load this category right now.</Text> : null}
      {state.kind === 'ok' && state.body.stale ? <Text className="text-accent text-sm mb-row">Couldn't refresh — showing an earlier list.</Text> : null}
      {state.kind === 'ok' && shows.length === 0 ? <Text className="text-muted text-sm">No shows here yet.</Text> : null}
      {shows.map((s, i) => (
        <Pressable
          key={s.feedUrl}
          onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })}
          accessibilityRole="button"
          accessibilityLabel={`${i + 1}. ${s.title}, ${s.author}${s.latestEpisode ? `. Newest: ${s.latestEpisode.title}` : ''}`}
          className="flex-row items-center gap-row py-row border-b-hairline border-separator"
        >
          <Text className="text-muted text-sm w-6 text-center">{i + 1}</Text>
          <Artwork url={s.imageUrl} size={56} rounded="row" />
          <Box className="flex-1">
            <Text className="text-text text-sm font-semibold" numberOfLines={2}>{s.title}</Text>
            <Text className="text-muted text-xs" numberOfLines={1}>{s.author}</Text>
            {s.latestEpisode ? (
              <Text className="text-muted text-xs mt-0.5" numberOfLines={1}>
                {s.latestEpisode.publishedAt ? `${ago(s.latestEpisode.publishedAt, now)} · ` : ''}{s.latestEpisode.title}
              </Text>
            ) : null}
          </Box>
        </Pressable>
      ))}
    </Screen>
  );
}
