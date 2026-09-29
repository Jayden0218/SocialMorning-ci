/**
 * One category (M10): the genre's top shows from Apple's chart, through the server
 * (`GET /v1/categories/:id`, cached there). Tapping a show opens its page; nothing is
 * subscribed on the listener's behalf.
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Loader } from '../../src/ui/Loader';
import { genreById } from '../../src/discover/genres';
import { useSafety } from '../../src/safety/context';
import type { CategoryShows } from '../../src/social/api';
import { useSocial } from '../../src/social/context';
import { Artwork } from '../../src/ui/Artwork';
import { Screen } from '../../src/ui/Screen';

type State = { kind: 'loading' } | { kind: 'ok'; body: CategoryShows } | { kind: 'error' };

export default function CategoryScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const genreId = Number(id);
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

  const shows = state.kind === 'ok' ? state.body.shows.filter((s) => !hiddenFeeds.has(s.feedUrl)) : [];
  return (
    <Screen scroll className="pt-row">
      <Stack.Screen options={{ title: genre?.name ?? 'Category' }} />
      {state.kind === 'loading' ? <Loader className="my-section" /> : null}
      {state.kind === 'error' ? <Text className="text-muted text-sm">Couldn't load this category right now.</Text> : null}
      {state.kind === 'ok' && state.body.stale ? <Text className="text-accent text-sm mb-row">Couldn't refresh — showing an earlier list.</Text> : null}
      {state.kind === 'ok' && shows.length === 0 ? <Text className="text-muted text-sm">No shows here yet.</Text> : null}
      {shows.map((s, i) => (
        <Pressable
          key={s.feedUrl}
          onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })}
          accessibilityRole="button"
          accessibilityLabel={`${i + 1}. ${s.title}, ${s.author}`}
          className="flex-row items-center gap-row py-row border-b-hairline border-separator"
        >
          <Text className="text-muted text-sm w-6 text-center">{i + 1}</Text>
          <Artwork url={s.imageUrl} size={56} rounded="row" />
          <View className="flex-1">
            <Text className="text-text text-sm font-semibold" numberOfLines={2}>{s.title}</Text>
            <Text className="text-muted text-xs" numberOfLines={1}>{s.author}</Text>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}
