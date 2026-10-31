// A profile's "Often listened" row: the six shows they listened to most in the last 90 days.
/**
 * M22 US17 item 6. Read from the profile (`oftenListened`, computed on the server from their
 * listening of the last 90 days). Others see nothing when the person hid it in Privacy or keeps
 * their listening private; on your own profile the row says when it is hidden from others.
 *
 * M31 W4-A (T050; design-pulse2 social.html `profile--screen` "Often listened" 2 x 2 tile): one raise tile (radius 22, padding 14) with the mono
 * label OFTEN LISTENED in text3 and the shows' covers under it, 92 wide with radius 16 and 10 apart (they scroll sideways when there are more
 * than fit); a cover opens its show. Not as drawn: a title under each cover (the drawing shows covers only) stays for a screen reader's name only.
 */
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { spacing } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Type } from '@/ui/kit/Type';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { useM22DiscoverApi, type OftenListened as Data } from '@/social/api-m22-discover';

const ART = 92;
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
    <Box testID="often-listened" className="bg-raise" style={{ padding: ME_MOSAIC.pad, borderRadius: ME_MOSAIC.radius, gap: spacing.row }}>
      <Type step="tag" className="text-text3" accessibilityRole="header">OFTEN LISTENED</Type>
      {props.own && data.hidden ? <Type step="caption" className="text-text3">Only you see this row — it is hidden in Privacy.</Type> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: ME_MOSAIC.gap }}>
        {data.shows.map((s) => (
          <Pressable key={s.feedUrl} onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })} accessibilityRole="button" accessibilityLabel={`Open ${s.title}, often listened to by ${props.name}`} style={ITEM}>
            <Artwork url={s.imageUrl} size={ART} rounded="row" name={s.title} />
          </Pressable>
        ))}
      </ScrollView>
    </Box>
  );
}
