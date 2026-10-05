// An episode's comments: three sort orders, likes, write box with the current time.
/**
 * The comments page (M12 US2, FR-020…FR-027). Found on the iPhone 2026-09-29: the player's
 * comment button opened the keyboard with "No moment attached" at 4:58, and the list lived at
 * the bottom of a ~3000 pt episode page. Now the button opens this page: the list first, three
 * orders (Newest · Most liked · By moment), public likes, and a write box that stays at the
 * bottom and already carries the moment the listener came from (removable in the composer).
 *
 * M17 (`Comments-B`): the Editorial page — the serif "Comments N" title, the episode on the page
 * with a yellow play/pause, the three orders as the shared pill `Segmented`, each comment a white
 * card (CommentRow), and the write box a white pill with a yellow edge, the listener's initial on
 * the left and the moment as a yellow "at 26:37" chip.
 * M17 T104 (`CommentMenu-B`): the ⋯ menu sheet shows the comment on a card above icon rows.
 */
import { useCallback, useMemo, useState } from 'react';
import { Clipboard } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { orderComments, type CommentOrder } from '@socialmorning/social-core';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { hit } from '@/design';
import { mmss } from '@/ui/kit/format';
import { useSocial } from '@/social/context';
import { usePoll } from '@/social/usePoll';
import { useSafety } from '@/safety/context';
import type { Comment } from '@/social/api';
import { useM12Api } from '@/social/m12-api';
import type { ComposerState } from '@/social/composer';
import { ComposerSheet } from '@/ui/comments/Composer';
import { CommentRow, initialsFor, type LikeView } from '@/ui/comments/CommentRow';
import { ReportSheet, type ReportTarget } from '@/ui/comments/ReportSheet';
import { EmptyState } from '@/ui/kit/EmptyState';
import { useStores, useToast } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { usePlayer, usePlayerState } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { isFavComment, toggleFavComment } from '@/me/fav-comments';
import { EpisodeCard } from '@/ui/comments/EpisodeCard';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Segmented } from '@/ui/kit/Segmented';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { EndOfList } from '@/ui/kit/EndOfList';

const TAB = { minHeight: hit.min };
const WRITE = { minHeight: 52 };
const ME = { width: 36, height: 36 };
/** M17 T104: the comment menu's avatar (28 pt) and icon square (40 pt, as in `CommentMenu-B`). */
const AVATAR = { width: 28, height: 28 };
const ICON_BOX = { width: 40, height: 40 };
function menuIcon(label: string): IconName {
  if (label === 'Reply') return 'arrow-undo-outline';
  if (label === 'Copy') return 'copy-outline';
  if (label === 'Save') return 'bookmark-outline';
  if (label === 'Remove from saved') return 'bookmark';
  if (label === 'Delete') return 'trash-outline';
  return 'flag-outline';
}
const ORDERS: { value: CommentOrder; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'liked', label: 'Most liked' },
  { value: 'byMoment', label: 'By moment' },
];

export default function CommentsScreen(): React.ReactElement {
  const { episodeId, at } = useLocalSearchParams<{ episodeId: string; at?: string }>();
  const stores = useStores();
  const c = useColours(stores.settings);
  const toast = useToast();
  const m12 = useM12Api();
  const player = usePlayer();
  const playerState = usePlayerState();
  const { composer, listener, useEpisodeSocial, refresh, bump } = useSocial();
  const safety = useSafety();
  usePoll(episodeId);
  const { cached, stale } = useEpisodeSocial(episodeId);
  const episode = episodeId ? stores.feeds.getEpisode(episodeId) : undefined;
  const [order, setOrder] = useState<CommentOrder>('newest');
  const [likes, setLikes] = useState<Record<string, LikeView>>({});
  const [menu, setMenu] = useState<Comment | undefined>();
  const [reporting, setReporting] = useState<ReportTarget | undefined>();
  const [composing, setComposing] = useState<ComposerState | undefined>();
  const [, rerender] = useState(0);

  // The moment the listener came from (the player's position), else where they are in this episode.
  const atMs = at !== undefined && at !== '' && !Number.isNaN(Number(at)) ? Number(at)
    : playerState.kind !== 'idle' && playerState.episodeId === episodeId && 'positionMs' in playerState && typeof playerState.positionMs === 'number' ? playerState.positionMs
      : stores.positions.get(episodeId ?? '')?.offsetMs;

  const visible = useMemo(() => safety.comments(cached?.social.comments ?? []), [cached, safety]);
  const count = visible.reduce((n, x) => n + (x.deleted ? 0 : 1) + (x.replies ?? []).filter((r) => !r.deleted).length, 0);
  const ordered = useMemo(
    () => orderComments(visible.map((x) => ({ ...x, createdAt: new Date(x.createdAt).getTime(), likeCount: likes[x.id]?.count ?? x.likeCount ?? 0, raw: x })), order).map((o) => o.raw),
    [visible, order, likes],
  );
  const likeOf = useCallback((x: Comment): LikeView => likes[x.id] ?? { count: x.likeCount ?? 0, liked: x.likedByMe ?? false }, [likes]);

  const needSignIn = () => router.push('/auth/sign-in');
  const compose = (parentId?: string) => {
    if (!listener) { needSignIn(); return; }
    if (!episodeId) return;
    setComposing(composer.open({ episodeId, offsetMs: atMs ?? 0, ...(episode?.durationMs !== undefined ? { durationMs: episode.durationMs } : {}) }, parentId));
  };
  const seek = (offsetMs: number) => {
    if (!episodeId) return;
    if (playerState.kind !== 'idle' && playerState.episodeId === episodeId) { player.seek(offsetMs); player.play(); return; }
    const playable = toPlayable(stores, episodeId);
    if (playable) { player.load(playable, 'play'); player.seek(offsetMs); }
  };
  // FR-023: public likes, shown at once and put back if the server says no.
  const like = async (x: Comment) => {
    if (!listener) { needSignIn(); return; }
    const before = likeOf(x);
    const next = { count: before.count + (before.liked ? -1 : 1), liked: !before.liked };
    setLikes((l) => ({ ...l, [x.id]: next }));
    try {
      const r = before.liked ? await m12.unlikeComment(x.id) : await m12.likeComment(x.id);
      setLikes((l) => ({ ...l, [x.id]: { count: r.likeCount, liked: r.likedByMe } }));
    } catch {
      setLikes((l) => ({ ...l, [x.id]: before }));
      toast("Couldn't save that like — try again.");
    }
  };
  const remove = async (x: Comment) => {
    if (!episodeId) return;
    try { await composer.remove(episodeId, x.id); bump(episodeId); } catch { toast("Couldn't delete that comment."); }
  };

  const menuItems = (x: Comment) => [
    ...(x.parentId === null ? [{ label: 'Reply', run: () => compose(x.id) }] : []),
    ...(x.body ? [{ label: 'Copy', run: () => { Clipboard.setString(x.body ?? ''); toast('Copied.'); } }] : []),
    ...(x.body && episodeId ? [{
      label: isFavComment(stores.settings, x.id) ? 'Remove from saved' : 'Save',
      run: () => { toggleFavComment(stores.settings, { commentId: x.id, episodeId, body: x.body ?? '', author: x.displayName ?? 'A listener', offsetMs: x.offsetMs }, Date.now()); rerender((n) => n + 1); },
    }] : []),
    x.mine
      ? { label: 'Delete', run: () => void remove(x) }
      : { label: 'Report', run: () => setReporting({ kind: 'comment', id: x.id, authorId: x.authorId, label: 'comment' }) },
  ];

  return (
    <>
    <PageHeader title={count > 0 ? `Comments ${count}` : 'Comments'} />
    <Box className="flex-1 bg-background">
      {/* Owner, 2026-10-01: the episode, with its own play/pause, at the top of the page. */}
      {episodeId ? <EpisodeCard episodeId={episodeId} /> : null}
      <Segmented items={ORDERS} value={order} onChange={setOrder} className="mx-screen-x mt-row" />
      {stale ? <Text className="text-muted text-xs px-screen-x pt-2">Couldn't refresh — showing the last copy</Text> : null}
      <FlatList
        className="flex-1"
        data={ordered}
        // Owner, 2026-10-05: the bottom of a fetched list says so.
        ListFooterComponent={ordered.length > 0 ? <EndOfList /> : null}
        keyExtractor={(x) => x.id}
        contentContainerClassName="px-screen-x pt-row pb-section gap-row flex-grow"
        ListEmptyComponent={<EmptyState surface="comments" page action={{ label: 'Comment here', onPress: () => compose() }} />}
        renderItem={({ item }) => (
          <CommentRow
            c={item}
            serverTime={cached?.social.serverTime ?? new Date().toISOString()}
            likeOf={likeOf}
            iconColour={{ muted: c.muted, accent: c.accent }}
            onSeek={seek}
            onLike={(x) => void like(x)}
            onMenu={setMenu}
          />
        )}
      />
      {/* FR-021: the write box stays at the bottom and already carries the moment. */}
      <Pressable onPress={() => compose()} accessibilityRole="button" accessibilityLabel={listener ? `Write a comment${atMs !== undefined ? ` at ${mmss(atMs)}` : ''}` : 'Sign in to join the conversation'} className="flex-row items-center gap-2.5 mx-screen-x my-2 px-2 bg-surface border-2 border-primary rounded-pill" style={WRITE}>
        {listener ? (
          <Box className="rounded-pill bg-accentTint items-center justify-center" style={ME} accessible={false}>
            <Text className="text-text text-xs font-bold">{initialsFor({ displayName: listener.displayName })}</Text>
          </Box>
        ) : null}
        <Text className={listener ? 'text-muted text-body flex-1' : 'text-muted text-body flex-1 pl-2'} numberOfLines={1}>{listener ? 'Say something about this episode…' : 'Sign in to join the conversation'}</Text>
        {listener && atMs !== undefined ? <Text className="text-onPrimary text-xs font-bold bg-primary rounded-pill px-2.5 py-1.5">{`at ${mmss(atMs)}`}</Text> : null}
      </Pressable>
      <Actionsheet isOpen={menu !== undefined} onClose={() => setMenu(undefined)}>
        <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
        <ActionsheetContent className="bg-surface rounded-t-row px-screen-x items-stretch">
          <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
          {/* M17 (`CommentMenu-B`, T104): the comment itself on a white card, then one row per action
              with its icon in a bordered square; Delete / Report sit under a rule; Cancel is a pill. */}
          {menu ? (
            <Box className="bg-surface border border-border rounded-row p-row mt-gap mb-row" accessible accessibilityLabel={`${menu.displayName ?? 'A listener'}${menu.offsetMs !== null ? ` at ${mmss(menu.offsetMs)}` : ''}: ${menu.body ?? ''}`}>
              <Box className="flex-row items-center gap-gap">
                <Box className="rounded-pill bg-accentTint items-center justify-center" style={AVATAR}>
                  <Text className="text-text text-micro font-bold">{initialsFor(menu)}</Text>
                </Box>
                <Text className="text-text text-meta font-bold flex-1" numberOfLines={1}>{menu.displayName ?? 'A listener'}</Text>
                {menu.offsetMs !== null ? <Text className="text-accent text-xs font-bold">{mmss(menu.offsetMs)}</Text> : null}
              </Box>
              {menu.body ? <Text className="text-text text-title font-display-semibold mt-gap" numberOfLines={4}>{menu.body}</Text> : null}
            </Box>
          ) : null}
          {menu ? menuItems(menu).map((item) => {
            const strong = item.label === 'Delete' || item.label === 'Report';
            return (
              <Box key={item.label}>
                {strong ? <Box className="border-b-hairline border-separator my-gap" /> : null}
                <Pressable onPress={() => { setMenu(undefined); item.run(); }} accessibilityRole="button" className="flex-row items-center gap-section" style={TAB}>
                  <Box className="rounded-row bg-surface border border-border items-center justify-center" style={ICON_BOX}>
                    <Icon name={menuIcon(item.label)} size={18} color={c.accent} />
                  </Box>
                  <Text className={strong ? 'text-accent text-sm font-semibold' : 'text-text text-sm font-semibold'}>{item.label}</Text>
                </Pressable>
              </Box>
            );
          }) : null}
          <Pressable onPress={() => setMenu(undefined)} accessibilityRole="button" className="justify-center items-center rounded-pill border border-border mt-row" style={TAB}>
            <Text className="text-accent text-body font-bold">Cancel</Text>
          </Pressable>
        </ActionsheetContent>
      </Actionsheet>
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
      {composing ? <ComposerSheet initial={composing} onClose={() => setComposing(undefined)} onPosted={() => { if (episodeId) void refresh(episodeId); }} /> : null}
    </Box>
    </>
  );
}

