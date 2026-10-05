// A comment's replies: the comment on top, every reply under it, a reply box with a mic.
/**
 * The reply page (M19 US5, FR-043): "N replies ›" under a comment opens it. The parent comment
 * first (a CommentRow card), then every reply oldest first as its own card, then "No more to
 * fetch"; at the bottom the reply box — tapping it opens the same composer the comments page
 * uses (POST /v1/episodes/:id/comments with `parentId`), and the mic beside it records a voice
 * reply (FR-044). Each card's ⋯ has Copy, Mark as unfriendly / Unmark (not on your own) and
 * Delete or Report; Reply on any card replies to the parent (replies are one level deep).
 * Data: GET /v1/comments/:id/thread → { parent, replies }. `episodeId` comes in the route.
 */
import { useCallback, useState } from 'react';
import { Clipboard } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { hit } from '@/design';
import { useSocial } from '@/social/context';
import type { Comment } from '@/social/api';
import { useM12Api } from '@/social/m12-api';
import { useCommentExtrasApi, type Thread } from '@/social/comment-extras-api';
import type { ComposerState } from '@/social/composer';
import { ComposerSheet } from '@/ui/comments/Composer';
import { CommentRow, type LikeView } from '@/ui/comments/CommentRow';
import { ReportSheet, type ReportTarget } from '@/ui/comments/ReportSheet';
import { VoiceComposer } from '@/ui/comments/VoiceRecord';
import { playVoice } from '@/playback/expo-audio-adapter';
import { getPref } from '@/settings/prefs';
import { useStores, useToast } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { usePlayer, usePlayerState } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { EndOfList } from '@/ui/kit/EndOfList';

const TAB = { minHeight: hit.min };
const WRITE = { minHeight: 52 };
const ICON_BOX = { width: 40, height: 40 };
const ICONS: Record<string, IconName> = {
  Reply: 'arrow-undo-outline', Copy: 'copy-outline', 'Mark as unfriendly': 'eye-off-outline', Unmark: 'eye-outline', Delete: 'trash-outline', Report: 'flag-outline',
};

export default function ThreadScreen(): React.ReactElement {
  const { commentId, episodeId } = useLocalSearchParams<{ commentId: string; episodeId?: string }>();
  const stores = useStores();
  const c = useColours(stores.settings);
  const toast = useToast();
  const m12 = useM12Api();
  const extras = useCommentExtrasApi();
  const player = usePlayer();
  const playerState = usePlayerState();
  const { composer, listener, refresh, bump } = useSocial();
  const [thread, setThread] = useState<Thread | undefined>();
  const [failed, setFailed] = useState(false);
  const [likes, setLikes] = useState<Record<string, LikeView>>({});
  const [marked, setMarked] = useState<Record<string, true>>({});
  const [menu, setMenu] = useState<Comment | undefined>();
  const [reporting, setReporting] = useState<ReportTarget | undefined>();
  const [composing, setComposing] = useState<ComposerState | undefined>();
  const ep = episodeId ?? '';

  const load = useCallback(() => {
    if (!commentId) return () => undefined;
    let live = true;
    extras.thread(commentId).then((t) => { if (live) { setThread(t); setFailed(false); } }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [extras, commentId]);
  useFocusEffect(load);
  const reload = () => { load(); if (ep) void refresh(ep); };

  const playing = playerState.kind !== 'idle' && playerState.episodeId === ep && 'positionMs' in playerState && typeof playerState.positionMs === 'number' ? playerState.positionMs : undefined;
  const likeOf = useCallback((x: Comment): LikeView => likes[x.id] ?? { count: x.likeCount ?? 0, liked: x.likedByMe ?? false }, [likes]);
  const needSignIn = () => router.push('/auth/sign-in');

  const reply = () => {
    if (!listener) { needSignIn(); return; }
    if (!ep || !commentId) return;
    const atMs = playing ?? stores.positions.get(ep)?.offsetMs ?? 0;
    setComposing(composer.open({ episodeId: ep, offsetMs: atMs }, commentId));
  };
  const seek = (offsetMs: number) => {
    if (!ep) return;
    if (playerState.kind !== 'idle' && playerState.episodeId === ep) { player.seek(offsetMs); player.play(); return; }
    const playable = toPlayable(stores, ep);
    if (playable) { player.load(playable, 'play'); player.seek(offsetMs); }
  };
  const like = async (x: Comment) => {
    if (!listener) { needSignIn(); return; }
    const before = likeOf(x);
    setLikes((l) => ({ ...l, [x.id]: { count: before.count + (before.liked ? -1 : 1), liked: !before.liked } }));
    try {
      const r = before.liked ? await m12.unlikeComment(x.id) : await m12.likeComment(x.id);
      setLikes((l) => ({ ...l, [x.id]: { count: r.likeCount, liked: r.likedByMe } }));
    } catch {
      setLikes((l) => ({ ...l, [x.id]: before }));
      toast("Couldn't save that like — try again.");
    }
  };
  const remove = async (x: Comment) => {
    if (!ep) return;
    try {
      await composer.remove(ep, x.id);
      bump(ep);
      if (x.id === commentId) { router.back(); return; }
      reload();
    } catch { toast("Couldn't delete that comment."); }
  };
  const markUnfriendly = async (x: Comment, on: boolean) => {
    if (!listener) { needSignIn(); return; }
    try {
      const r = on ? await extras.markUnfriendly(x.id) : await extras.unmarkUnfriendly(x.id);
      setMarked((m) => { const n = { ...m }; if (on) n[x.id] = true; else delete n[x.id]; return n; });
      toast(on ? (r.folded ? 'Marked. It is now hidden for everyone.' : 'Marked as unfriendly. Thank you.') : 'Mark removed.');
      reload();
    } catch { toast("Couldn't save that — try again."); }
  };
  const menuItems = (x: Comment) => [
    { label: 'Reply', run: reply },
    ...(x.body ? [{ label: 'Copy', run: () => { Clipboard.setString(x.body ?? ''); toast('Copied.'); } }] : []),
    ...(!x.mine && listener ? [{ label: marked[x.id] ? 'Unmark' : 'Mark as unfriendly', run: () => void markUnfriendly(x, !marked[x.id]) }] : []),
    x.mine
      ? { label: 'Delete', run: () => void remove(x) }
      : { label: 'Report', run: () => setReporting({ kind: 'comment', id: x.id, authorId: x.authorId, label: 'comment' }) },
  ];

  const row = (x: Comment) => (
    <CommentRow
      c={{ ...x, replies: [] }}
      serverTime={new Date().toISOString()}
      likeOf={likeOf}
      iconColour={{ muted: c.muted, accent: c.accent }}
      onSeek={seek}
      onLike={(y) => void like(y)}
      onMenu={setMenu}
      playVoice={playVoice}
            teenMode={getPref(stores.settings, 'hideExplicit')}
    />
  );
  const replies = thread?.replies ?? [];
  const name = thread?.parent.displayName ?? 'this comment';

  return (
    <>
    <PageHeader title="Replies" />
    <Box className="flex-1 bg-background">
      {failed && !thread ? <Text className="text-muted text-body px-screen-x pt-row">Couldn't load the replies — pull back and try again.</Text> : null}
      <FlatList
        className="flex-1"
        data={replies}
        keyExtractor={(x) => x.id}
        contentContainerClassName="px-screen-x pt-row pb-section gap-row flex-grow"
        ListHeaderComponent={thread ? <Box className="mb-row">{row(thread.parent)}</Box> : undefined}
        ListFooterComponent={thread ? <EndOfList /> : undefined}
        ListEmptyComponent={thread ? <Text className="text-muted text-body text-center pt-section">No replies yet — be the first.</Text> : undefined}
        renderItem={({ item }) => row(item)}
      />
      {ep && commentId ? (
        <Box className="mx-screen-x my-2">
          <VoiceComposer episodeId={ep} parentId={commentId} offsetMs={() => playing} onPosted={reload}>
            <Pressable onPress={reply} accessibilityRole="button" accessibilityLabel={listener ? `Reply to ${name}` : 'Sign in to reply'} className="flex-row items-center px-row bg-surface border-2 border-primary rounded-pill" style={WRITE}>
              <Text className="text-muted text-body flex-1" numberOfLines={1}>{listener ? `Reply to ${name}…` : 'Sign in to reply'}</Text>
            </Pressable>
          </VoiceComposer>
        </Box>
      ) : null}
      <Actionsheet isOpen={menu !== undefined} onClose={() => setMenu(undefined)}>
        <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
        <ActionsheetContent className="bg-surface rounded-t-row px-screen-x items-stretch">
          <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
          {menu ? menuItems(menu).map((item) => {
            const strong = item.label === 'Delete' || item.label === 'Report';
            return (
              <Box key={item.label}>
                {strong ? <Box className="border-b-hairline border-separator my-gap" /> : null}
                <Pressable onPress={() => { setMenu(undefined); item.run(); }} accessibilityRole="button" accessibilityLabel={item.label} className="flex-row items-center gap-section" style={TAB}>
                  <Box className="rounded-row bg-surface border border-border items-center justify-center" style={ICON_BOX}>
                    <Icon name={ICONS[item.label] ?? 'flag-outline'} size={18} color={c.accent} />
                  </Box>
                  <Text className={strong ? 'text-accent text-sm font-semibold' : 'text-text text-sm font-semibold'}>{item.label}</Text>
                </Pressable>
              </Box>
            );
          }) : null}
          <Pressable onPress={() => setMenu(undefined)} accessibilityRole="button" accessibilityLabel="Cancel" className="justify-center items-center rounded-pill border border-border mt-row" style={TAB}>
            <Text className="text-accent text-body font-bold">Cancel</Text>
          </Pressable>
        </ActionsheetContent>
      </Actionsheet>
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
      {composing ? <ComposerSheet initial={composing} onClose={() => setComposing(undefined)} onPosted={reload} /> : null}
    </Box>
    </>
  );
}
