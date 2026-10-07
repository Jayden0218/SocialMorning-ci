// A profile's "Often listened" row: the six shows they listened to most in the last 90 days.
/**
 * M22 US17 item 6. Read from the profile (`oftenListened`, computed on the server from their
 * listening of the last 90 days). Others see nothing when the person hid it in Privacy or keeps
 * their listening private; on your own profile the row says when it is hidden from others.
 */
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Artwork } from '@/ui/kit/Artwork';
import { useM22DiscoverApi, type OftenListened as Data } from '@/social/api-m22-discover';

const ART = 96;
const ITEM = { width: ART };

export function OftenListened(props: { listenerId: string; name: string; own: boolean }): React.ReactElement | null {
  const api = useM22DiscoverApi();
  const [data, setData] = useState<Data | undefined>();
  useEffect(() => {
    let live = true;
    api.oftenListened(props.listenerId).then((d) => { if (live) setData(d); }).catch(() => undefined);
    return () => { live = false; };
  }, [api, props.listenerId]);
  if (!data || data.shows.length === 0) return null;
  return (
    <Box className="gap-row">
      <Text className="text-text text-base font-display" accessibilityRole="header">Often listened</Text>
      {props.own && data.hidden ? <Text className="text-muted text-xs">Only you see this row — it is hidden in Privacy.</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-row">
        {data.shows.map((s) => (
          <Pressable key={s.feedUrl} onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })} accessibilityRole="button" accessibilityLabel={`Open ${s.title}, often listened to by ${props.name}`} style={ITEM}>
            <Artwork url={s.imageUrl} size={ART} rounded="row" name={s.title} />
            <Text className="text-text text-xs font-semibold mt-1" numberOfLines={2}>{s.title}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Box>
  );
}
