// Topic lists on Discover: the editors' collections as cards, each opening its full list.
/**
 * M21 US7 (T082, FR-061). The owner removed "Where to start" (the collections drawn as rows)
 * on 2026-10-05; M21 brings the same data back only in 小宇宙's "topic list" form — a row of
 * cards (title, subtitle, three covers), and a full-list page per card (`/topic/[id]`). The
 * cards are our own layout and words; nothing is copied.
 */
import { router } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Artwork } from '@/ui/kit/Artwork';
import { plural } from '@socialmorning/social-core';
import type { Collection } from '@/social/api';
import { SectionTitle } from './parts';

const COVERS = 3;

export function TopicListCards(props: { lists: Collection[] }): React.ReactElement | null {
  const lists = props.lists.filter((l) => l.items.length > 0);
  if (lists.length === 0) return null;
  return (
    <Box>
      <SectionTitle title="Topic lists" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-screen-x gap-row">
        {lists.map((l) => (
          <Pressable
            key={l.id}
            onPress={() => router.push({ pathname: '/topic/[id]', params: { id: l.id } })}
            accessibilityRole="button"
            accessibilityLabel={`${l.title}${l.subtitle ? `. ${l.subtitle}` : ''}. ${plural(l.items.length, 'episode')}`}
            className="w-56 bg-surface border border-border rounded-row p-row"
          >
            <Box className="flex-row gap-1">
              {l.items.slice(0, COVERS).map((i) => <Artwork key={i.key} url={i.episode.imageUrl} size={64} name={i.episode.showTitle} />)}
            </Box>
            <Text className="text-text text-body font-display-semibold mt-row" numberOfLines={2}>{l.title}</Text>
            {l.subtitle ? <Text className="text-muted text-xs mt-0.5" numberOfLines={2}>{l.subtitle}</Text> : null}
            <Text className="text-accent text-xs font-semibold mt-1">{plural(l.items.length, 'episode')}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Box>
  );
}
