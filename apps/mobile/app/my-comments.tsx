// Every comment you wrote, with its episode and time; tap to open.
/**
 * My comments (我的评论, M10; text M10b US2, FR-006): each of your comments with what you
 * wrote, its episode and moment, from `GET /v1/me/comments`. A deleted or removed comment
 * says so instead of its text. Tapping one opens the episode at that moment.
 *
 * M17 T067 (`MyComments-B`): the Editorial page — the serif title with the count under it (B puts
 * it as an eyebrow above; PageHeader has no slot there, so it is the `subtitle`), then
 * one white card per comment: 44 pt artwork beside the episode title (serif) and the show; a
 * hairline; what you wrote in the serif (a deleted or removed comment in muted italics); then the
 * moment as a small accent chip and the date. The whole card is still the one button, with the
 * same name and destination; loading, paging and the empty states unchanged.
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Loader } from '@/ui/kit/Loader';
import type { MyComment } from '@/social/api';
import { useSocial } from '@/social/context';
import { mmss, shortDate } from '@/ui/kit/format';
import { EmptyPicture } from '@/ui/me/parts';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Artwork } from '@/ui/kit/Artwork';
import { CardDivider } from '@/ui/kit/Card';
import { PlayIcon } from '@/ui/kit/Icon';
import { plural } from '@socialmorning/social-core';
import { EndOfList } from '@/ui/kit/EndOfList';

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

  if (rows === undefined) return <><PageHeader title="My comments" /><Box className="flex-1 bg-background p-section items-center"><Loader /></Box></>;
  // The count of what is loaded; "+" while more pages wait (the server sends no total).
  const count = rows.length > 0 ? `${plural(rows.length, 'comment')}${next ? '+' : ''}` : undefined;
  return (
    <>
    <PageHeader title="My comments" {...(count ? { subtitle: count } : {})} />
    <FlatList
      className="flex-1 bg-background"
      data={rows}
      // Owner, 2026-10-05: the bottom of a fetched list says so.
      ListFooterComponent={rows !== undefined && rows.length > 0 && !next ? <EndOfList /> : undefined}
      keyExtractor={(r) => r.id}
      contentContainerClassName="px-screen-x pt-1 pb-24 gap-row flex-grow"
      onEndReached={more}
      ListEmptyComponent={<EmptyPicture icon="chatbubbles-outline" line={!listener ? 'Sign in to comment' : failed ? "Couldn't load your comments" : 'No comments yet'} />}
      renderItem={({ item }) => {
        const text = item.removed ? 'Removed by moderation' : item.deleted ? 'You deleted this comment' : item.hiddenByHost ? `${item.body ?? ''} — hidden by the host` : item.body ?? '';
        return (
          <Pressable onPress={() => router.push({ pathname: '/episode/[id]', params: { id: item.episode.id, ...(item.offsetMs !== null ? { at: String(item.offsetMs) } : {}) } })}
            accessibilityRole="button" accessibilityLabel={`${text}. On ${item.episode.title}`} className="bg-surface border border-border rounded-row p-section gap-row">
            <Box className="flex-row items-center gap-row">
              <Artwork url={item.episode.imageUrl ?? null} size={44} rounded="row" name={item.episode.showTitle} />
              <Box className="flex-1">
                <Text className="text-text text-sm font-display" numberOfLines={2}>{item.episode.title}</Text>
                <Text className="text-muted text-xs" numberOfLines={1}>{item.episode.showTitle}</Text>
              </Box>
            </Box>
            <CardDivider />
            <Text className={item.body && !item.removed && !item.deleted ? 'text-text text-body font-display-semibold' : 'text-muted text-body italic'} numberOfLines={5}>{text}</Text>
            <Box className="flex-row items-center gap-gap">
              {item.offsetMs !== null ? (
                <Box className="flex-row items-center gap-1 px-2 py-0.5 rounded-pill bg-accentTint">
                  <PlayIcon size={8} tint="accent" />
                  <Text className="text-accent text-xs font-bold">{mmss(item.offsetMs)}</Text>
                </Box>
              ) : null}
              <Text className="text-muted text-xs">{shortDate(Date.parse(item.createdAt))}</Text>
            </Box>
          </Pressable>
        );
      }}
    />
    </>
  );
}
