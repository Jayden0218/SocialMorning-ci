/**
 * My comments (我的评论, M10; text M10b US2, FR-006): each of your comments with what you
 * wrote, its episode and moment, from `GET /v1/me/comments`. A deleted or removed comment
 * says so instead of its text. Tapping one opens the episode at that moment.
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList } from '../src/ui/lib/flat-list';
import { Pressable } from '../src/ui/lib/pressable';
import { Text } from '../src/ui/lib/text';
import { Box } from '../src/ui/lib/box';
import { Loader } from '../src/ui/Loader';
import type { MyComment } from '../src/social/api';
import { useSocial } from '../src/social/context';
import { mmss, shortDate } from '../src/ui/format';
import { EmptyPicture } from '../src/ui/me/parts';

export default function MyCommentsScreen(): React.ReactElement {
  const { api, listener } = useSocial();
  const [rows, setRows] = useState<MyComment[] | undefined>();
  const [next, setNext] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!listener) { setRows([]); return; }
    let live = true;
    api.myComments().then((r) => { if (live) { setRows(r.items); setNext(r.next); } }, () => { if (live) { setRows([]); setFailed(true); } });
    return () => { live = false; };
  }, [api, listener]);
  const more = useCallback(() => {
    if (!next) return;
    const at = next;
    setNext(undefined);
    void api.myComments(at).then((r) => { setRows((cur) => [...(cur ?? []), ...r.items]); setNext(r.next); }, () => setNext(at));
  }, [api, next]);

  if (rows === undefined) return <Box className="flex-1 bg-background p-section items-center"><Loader /></Box>;
  return (
    <FlatList
      className="flex-1 bg-background"
      data={rows}
      keyExtractor={(r) => r.id}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow"
      onEndReached={more}
      ListEmptyComponent={<EmptyPicture icon="chatbubbles-outline" line={!listener ? 'Sign in to comment' : failed ? "Couldn't load your comments" : 'No comments yet'} />}
      renderItem={({ item }) => {
        const text = item.removed ? 'Removed by moderation' : item.deleted ? 'You deleted this comment' : item.hiddenByHost ? `${item.body ?? ''} — hidden by the host` : item.body ?? '';
        return (
          <Pressable onPress={() => router.push({ pathname: '/episode/[id]', params: { id: item.episode.id, ...(item.offsetMs !== null ? { at: String(item.offsetMs) } : {}) } })}
            accessibilityRole="button" accessibilityLabel={`${text}. On ${item.episode.title}`} className="py-row border-b-hairline border-separator gap-1">
            <Text className={item.body ? 'text-text text-sm' : 'text-muted text-sm italic'} numberOfLines={5}>{text}</Text>
            <Text className="text-muted text-xs" numberOfLines={1}>{[item.episode.title, item.offsetMs !== null ? `at ${mmss(item.offsetMs)}` : undefined, shortDate(Date.parse(item.createdAt))].filter(Boolean).join(' · ')}</Text>
          </Pressable>
        );
      }}
    />
  );
}
