// A comment's replies: the comment on top, All or Newest replies under it, a reply box with a mic.
/**
 * The reply page (M19 US5, FR-043): "N replies ›" under a comment opens it. The parent comment
 * first (a CommentRow card), then every reply oldest first as its own card, then "No more to
 * fetch"; at the bottom the reply box — tapping it opens the same composer the comments page
 * uses (POST /v1/episodes/:id/comments with `parentId`), and the mic beside it records a voice
 * reply (FR-044). Each card's ⋯ has Copy, Mark as unfriendly / Unmark (not on your own) and
 * Delete or Report; Reply on any card replies to the parent (replies are one level deep).
 * Data: GET /v1/comments/:id/thread → { parent, replies }. `episodeId` comes in the route.
 *
 * M21 US6: All / Newest tabs over the replies (`?tab=newest` — newest first; All keeps the
 * conversation oldest first). A tap on a card opens its menu (as the long-press), which adds
 * Share (the episode link at that moment) and Mute (others' cards; hidden for me only).
 *
 * M31 W2-B (T032; `design-pulse2/social.html#comment-thread--screen` and its variants): the Pulse Stage + Thread. The comment being
 * answered is the stage at the top (avatar, name, its solid moment chip that plays from there, the words in Unbounded 22, the
 * heart, the age and episode, ⋯) over a soft glow; the replies hang on the spine below it, each with an age tick; the thumb zone
 * has the back circle, "Replies 6", the All / Newest capsule and the reply composer with a mic. Signed out the composer is one
 * light "Sign in to reply" button; no replies and a failed load have their own blocks.
 */
import { useCallback, useState } from 'react';
import { Clipboard, Share, useWindowDimensions } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FlatList } from '@/ui/lib/flat-list';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { useSocial } from '@/social/context';
import type { Comment } from '@/social/api';
import { useM12Api } from '@/social/m12-api';
import { useCommentExtrasApi, type Thread } from '@/social/comment-extras-api';
import type { ComposerState } from '@/social/composer';
import { ComposerSheet } from '@/ui/comments/Composer';
import { CommentRow, agoAndPlace, placeOf, shortAgo, type LikeView } from '@/ui/comments/CommentRow';
import { CommentMenu, type MenuItem } from '@/ui/comments/CommentMenu';
import { ReportSheet, type ReportTarget } from '@/ui/comments/ReportSheet';
import { VoiceComposer } from '@/ui/comments/VoiceRecord';
import { BottomZone, Capsule, ComposerBar, SignInBar, ZoneTitle } from '@/ui/comments/CommentsBottom';
import { GhostRows, SpineLine, SpineNode, StageGlow, Tick } from '@/ui/comments/Spine';
import { COMMENTS, ZONE_BOTTOM, belowStatus } from '@/ui/comments/measures';
import { useInsets } from '@/ui/comments/useInsets';
import { playVoice } from '@/playback/expo-audio-adapter';
import { getPref } from '@/settings/prefs';
import { useStores, useToast } from '@/ui/shell/providers';
import { livePositionMs, selectEpisodeId, usePlayer, usePlayerSelector } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { goBack } from '@/ui/kit/PageHeader';
import { Avatar } from '@/ui/kit/Avatar';
import { Curve } from '@/ui/kit/Curve';
import { Fade } from '@/ui/kit/Fade';
import { Icon } from '@/ui/kit/Icon';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { mmss, relativeTime } from '@/ui/kit/format';
import { colour } from '@/design';
import { plural } from '@socialmorning/social-core';
import { drawnType } from '@/design/type-px';

type Tab = 'all' | 'newest';
const TABS: { value: Tab; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'newest', label: 'Newest' }];
const NO_DATA: readonly number[] = [];
/** A 48 tap on a 16 glyph row. */
const SLOP = { top: 16, bottom: 16, left: 8, right: 8 };

export default function ThreadScreen(): React.ReactElement {
  const { commentId, episodeId } = useLocalSearchParams<{ commentId: string; episodeId?: string }>();
  const stores = useStores();
  const toast = useToast();
  const m12 = useM12Api();
  const extras = useCommentExtrasApi();
  const player = usePlayer();
  const loadedId = usePlayerSelector(selectEpisodeId);
  const insets = useInsets();
  const { width } = useWindowDimensions();
  const { composer, listener, refresh, bump } = useSocial();
  const [thread, setThread] = useState<Thread | undefined>();
  const [failed, setFailed] = useState(false);
  const [likes, setLikes] = useState<Record<string, LikeView>>({});
  const [marked, setMarked] = useState<Record<string, true>>({});
  const [menu, setMenu] = useState<Comment | undefined>();
  const [reporting, setReporting] = useState<ReportTarget | undefined>();
  const [composing, setComposing] = useState<ComposerState | undefined>();
  const [tab, setTab] = useState<Tab>('all');
  const [stage, setStage] = useState(0);
  const [zone, setZone] = useState(0);
  const ep = episodeId ?? '';

  const load = useCallback(() => {
    if (!commentId) return () => undefined;
    let live = true;
    extras.thread(commentId, tab).then((t) => { if (live) { setThread(t); setFailed(false); } }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [extras, commentId, tab]);
  useFocusEffect(load);
  const reload = () => { load(); if (ep) void refresh(ep); };

  const likeOf = useCallback((x: Comment): LikeView => likes[x.id] ?? { count: x.likeCount ?? 0, liked: x.likedByMe ?? false }, [likes]);
  const needSignIn = () => router.push('/auth/sign-in');

  const reply = () => {
    if (!listener) { needSignIn(); return; }
    if (!ep || !commentId) return;
    const atMs = livePositionMs(player, ep) ?? stores.positions.get(ep)?.offsetMs ?? 0;
    setComposing(composer.open({ episodeId: ep, offsetMs: atMs }, commentId));
  };
  const seek = (offsetMs: number) => {
    if (!ep) return;
    if (loadedId === ep) { player.seek(offsetMs); player.play(); return; }
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
  // M21 US6: the episode's link at the comment's moment, with its words.
  const shareComment = (x: Comment) => {
    if (!ep) return;
    const url = m12.episodePageUrl(ep, x.offsetMs ?? undefined);
    const words = x.body ? `${x.displayName ?? 'A listener'}: “${x.body}”\n` : '';
    void Share.share({ message: `${words}${url}`, url }).catch(() => undefined);
  };
  // M21 US6 (G-M21-6): hidden for me only; they are never told.
  const mute = async (x: Comment) => {
    if (!listener) { needSignIn(); return; }
    if (!x.authorId) return;
    try {
      await extras.mute(x.authorId);
      toast(`Muted ${x.displayName ?? 'this listener'}. Unmute from their profile.`);
      if (x.id === commentId) { router.back(); return; }
      reload();
    } catch { toast("Couldn't mute — try again."); }
  };
  const menuItems = (x: Comment): MenuItem[] => [
    { label: 'Reply', run: reply },
    { label: 'Share', run: () => shareComment(x) },
    ...(x.body ? [{ label: 'Copy', run: () => { Clipboard.setString(x.body ?? ''); toast('Copied.'); } }] : []),
    ...(!x.mine && listener && x.authorId ? [{ label: 'Mute', run: () => void mute(x) }] : []),
    ...(!x.mine && listener ? [{ label: marked[x.id] ? 'Unmark' : 'Mark as unfriendly', run: () => void markUnfriendly(x, !marked[x.id]) }] : []),
    x.mine
      ? { label: 'Delete', run: () => void remove(x) }
      : { label: 'Report', run: () => setReporting({ kind: 'comment', id: x.id, authorId: x.authorId, label: 'comment' }) },
  ];

  const replies = thread?.replies ?? [];
  const parent = thread?.parent;
  const name = parent?.displayName ?? 'this comment';
  const serverTime = new Date().toISOString();
  const listTop = Math.max(belowStatus(insets.top, 250), belowStatus(insets.top, 60) + stage + COMMENTS.stageGap);
  const parentLike = parent ? likeOf(parent) : undefined;
  const episodeTitle = ep ? stores.feeds.getEpisode(ep)?.title : undefined;

  return (
    <Box className="flex-1 bg-void">
      <StageGlow width={width} top={COMMENTS.glowTop} />
      {/* The stage: the comment being answered. */}
      {parent ? (
        <Box className="absolute" style={{ left: COMMENTS.gutter, right: COMMENTS.gutter, top: belowStatus(insets.top, 60), gap: COMMENTS.stageGap, zIndex: 5 }} onLayout={(e) => setStage(e.nativeEvent.layout.height)} testID="thread-stage">
          <Box className="flex-row items-center" style={{ gap: 10 }}>
            <Avatar size={COMMENTS.stageAvatar} url={parent.avatarUrl} name={parent.displayName} />
            <Type step="row" className="text-text flex-1" numberOfLines={1}>{parent.mine ? 'You' : name}</Type>
            {parent.offsetMs !== null ? <Box><TimestampChip text={mmss(parent.offsetMs)} solid onPress={() => seek(parent.offsetMs!)} /></Box> : null}
          </Box>
          <Pressable
            onPress={() => setMenu(parent)}
            onLongPress={() => setMenu(parent)}
            delayLongPress={350}
            accessibilityRole="button"
            accessibilityLabel={[name, relativeTime(parent.createdAt, serverTime), parent.body ?? ''].filter((x) => x !== '').join(', ')}
            accessibilityHint="Opens reply, share, copy, mute and report"
          >
            {parent.body ? <Type step="title" className="text-text" numberOfLines={6} style={drawnType.threadParent}>{parent.body}</Type> : null}
          </Pressable>
          <Box className="flex-row items-center" style={{ gap: COMMENTS.actionGap }}>
            {parent.mine ? (
              parentLike && parentLike.count > 0 ? <Box className="flex-row items-center" style={{ gap: 5 }}><Icon name="heart" size={16} color={colour.hotText} /><Type step="mono" className="text-hotText">{parentLike.count}</Type></Box> : null
            ) : (
              <Pressable onPress={() => void like(parent)} accessibilityRole="button" accessibilityState={{ selected: parentLike?.liked === true }} accessibilityLabel={`${parentLike?.liked ? 'Unlike' : 'Like'}. ${plural(parentLike?.count ?? 0, 'like')}`} hitSlop={SLOP} className="flex-row items-center" style={{ gap: 5 }}>
                <Icon name={parentLike?.liked ? 'heart' : 'heart-outline'} size={16} color={parentLike?.liked ? colour.hotText : colour.text2} />
                {(parentLike?.count ?? 0) > 0 ? <Type step="mono" className={parentLike?.liked ? 'text-hotText' : 'text-text2'}>{parentLike?.count}</Type> : null}
              </Pressable>
            )}
            <Type step="caption" className="text-text2 flex-1" numberOfLines={1}>{[agoAndPlace(parent.createdAt, serverTime, placeOf(parent)), episodeTitle].filter((x): x is string => !!x).join(' · ')}</Type>
            <Pressable onPress={() => setMenu(parent)} accessibilityRole="button" accessibilityLabel="More for this comment" hitSlop={SLOP}>
              <Icon name="ellipsis-horizontal" size={16} color={colour.text2} />
            </Pressable>
          </Box>
        </Box>
      ) : null}
      {/* The replies hang on the spine. */}
      <Box className="absolute left-0 right-0 bottom-0 overflow-hidden" style={{ top: listTop, zIndex: 3 }} testID="replies-thread">
        {failed && !thread ? (
          <Box className="items-center" style={{ paddingHorizontal: 36, paddingTop: 80, gap: 12 }} accessibilityLiveRegion="polite">
            <Box className="bg-raise items-center justify-center rounded-pill" style={{ width: 64, height: 64 }}><Icon name="wifi" size={28} color={colour.hotText} /></Box>
            <Type step="lede" className="text-text text-center">Couldn't load the replies — pull back and try again.</Type>
          </Box>
        ) : !thread ? (
          <Box style={{ paddingTop: COMMENTS.listTop, paddingRight: COMMENTS.listRight }}><GhostRows /></Box>
        ) : replies.length === 0 ? (
          <Box className="items-center" style={{ paddingHorizontal: 24, paddingTop: 50, gap: 10 }}>
            <Box style={{ width: 200 }} accessible={false} importantForAccessibility="no-hide-descendants"><Curve data={NO_DATA} flat count={40} height={20} /></Box>
            <Type step="lede" className="text-text text-center">No replies yet</Type>
            <Type step="note" className="text-text2 text-center">No replies yet — be the first.</Type>
          </Box>
        ) : (
          <>
            <SpineLine />
            <FlatList
              data={replies}
              keyExtractor={(x) => x.id}
              contentContainerStyle={{ paddingTop: COMMENTS.listTop, paddingLeft: COMMENTS.listLeft, paddingRight: COMMENTS.listRight, paddingBottom: zone + 24, gap: COMMENTS.nodeGap }}
              ListFooterComponent={<Box className="flex-row items-center" style={{ width: COMMENTS.chipColumn, justifyContent: 'center' }}><Tick text="That's all" /></Box>}
              renderItem={({ item }) => (
                <SpineNode momentMs={null} tick={shortAgo(item.createdAt, serverTime)}>
                  <CommentRow
                    c={{ ...item, replies: [] }}
                    serverTime={serverTime}
                    likeOf={likeOf}
                    onSeek={seek}
                    onLike={(y) => void like(y)}
                    onMenu={setMenu}
                    playVoice={playVoice}
                    teenMode={getPref(stores.settings, 'hideExplicit')}
                    level={0}
                  />
                </SpineNode>
              )}
            />
          </>
        )}
      </Box>
      <Fade bottom={0} height={COMMENTS.fullHeight + 70} />
      {/* The thumb zone: back and the title, the All / Newest capsule, the reply composer. */}
      <BottomZone bottom={ZONE_BOTTOM}>
        <Box style={{ gap: COMMENTS.zoneGap }} onLayout={(e) => setZone(e.nativeEvent.layout.height + ZONE_BOTTOM)}>
          <ZoneTitle
            title="Replies"
            count={thread ? replies.length : undefined}
            back={{ icon: 'chevron-back', label: 'Back', onPress: goBack }}
            right={<Capsule hug items={TABS} value={tab} onChange={setTab} />}
          />
          {ep && commentId ? (
            listener ? (
              <VoiceComposer episodeId={ep} parentId={commentId} offsetMs={() => livePositionMs(player, ep)} onPosted={reload}>
                {(mic) => <ComposerBar placeholder={`Reply to ${name}`} accessibilityLabel={`Reply to ${name}`} onOpen={reply} mic={mic} />}
              </VoiceComposer>
            ) : <SignInBar label="Sign in to reply" onPress={needSignIn} />
          ) : null}
        </Box>
      </BottomZone>
      <CommentMenu comment={menu} items={menu ? menuItems(menu) : []} onClose={() => setMenu(undefined)} />
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
      {composing ? <ComposerSheet initial={composing} onClose={() => setComposing(undefined)} onPosted={reload} /> : null}
    </Box>
  );
}
