// An episode's comments: four sort orders either way round, likes, who is listening now, write box with the current time and a mic.
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
 * M19 US5/US6 (FR-040…FR-044): a fourth order, "Smart" (likes + 2 × replies − age; the pinned
 * comment first under every order); the ⋯ menu adds "Mark as unfriendly" / "Unmark" (not on your
 * own) and, for the show's proven host, "Pin" / "Unpin" on a top-level comment; "N replies ›"
 * opens the reply page; a mic beside the write box records a voice comment at the moment.
 * The host test: a proven creator claim (GET /v1/creator/claims) on this episode's feed — the
 * same proof the server uses for the Host badge. A mark this listener made is remembered for
 * the page's life only (the server sends no "marked by me"), so "Unmark" shows until it closes.
 *
 * M21 US6: an arrow beside the orders turns the active order round ("Reverse order"); "N listening
 * now" sits under the title (src/social/live.ts, shown at 2 or more); a tap on a comment opens the
 * same menu as the long-press, which adds Share (the episode link at the comment's moment, with
 * its words) and Mute (others' comments — hidden for me only, the writer is never told).
 *
 * M31 W2-B (T032; `design-pulse2/social.html#comments--screen` and `index.html#comments--screen`): the Pulse Thread. The episode
 * strip (cover, title, "12:32 / 48:10", Pause) and the 26-tall map of the whole episode sit at the top; under them the time
 * spine — in By moment every moment is a solid chip with "n reacted" and its comments hang to the right; in the other orders
 * each comment carries its own chip. The thumb zone holds the close circle with "Comments 14", the order capsule (Newest · Most
 * liked · By moment) with the options circle (Smart order, Reverse order), and the composer (the moment chip follows the
 * playhead; mic records a voice comment; image adds a picture). Where the two drawings differ (index: one "By moment ▾" chip,
 * no strip; social: the capsule and the strip) this follows social.html, whose action map is the superset — the strip keeps
 * "Episode title → player · Play/Pause" and the capsule keeps the three orders on the page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clipboard } from 'react-native';
import type { FlatList as RNFlatList } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { GIVE_UP_AFTER_MS, defaultDir, orderComments, type CommentDir, type CommentOrder } from '@socialmorning/social-core';
import { Share } from 'react-native';
import { FlatList } from '@/ui/lib/flat-list';
import { Box } from '@/ui/lib/box';
import { mmss } from '@/ui/kit/format';
import { useSocial } from '@/social/context';
import { usePoll } from '@/social/usePoll';
import { useSafety } from '@/safety/context';
import type { Comment } from '@/social/api';
import { useM12Api } from '@/social/m12-api';
import type { ComposerState } from '@/social/composer';
import { ComposerSheet } from '@/ui/comments/Composer';
import { CommentRow, type LikeView } from '@/ui/comments/CommentRow';
import { CommentMenu, type MenuItem } from '@/ui/comments/CommentMenu';
import { ReportSheet, type ReportTarget } from '@/ui/comments/ReportSheet';
import { EmptyState } from '@/ui/kit/EmptyState';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Fade } from '@/ui/kit/Fade';
import { Type } from '@/ui/kit/Type';
import { useStores, useToast } from '@/ui/shell/providers';
import { episodePlayView, livePositionMs, usePlayer } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { isFavComment, toggleFavComment } from '@/me/fav-comments';
import { EpisodeCard } from '@/ui/comments/EpisodeCard';
import { goBack } from '@/ui/kit/PageHeader';
import { extrasOf, replyCountOf, useCommentExtrasApi } from '@/social/comment-extras-api';
import { VoiceComposer } from '@/ui/comments/VoiceRecord';
import { useM22Api } from '@/social/api-m22-server';
import { playVoice } from '@/playback/expo-audio-adapter';
import { getPref } from '@/settings/prefs';
import { liveLabel, useListeningNow } from '@/social/live';
import { useM22SocialApi } from '@/social/api-m22-social';
import { BottomZone, Capsule, ComposerBar, SignInBar, ZoneTitle } from '@/ui/comments/CommentsBottom';
import { IconButton } from '@/ui/kit/PulseButton';
import { CommentsMap } from '@/ui/comments/CommentsMap';
import { GhostRows, SpineLine, SpineNode, Tick } from '@/ui/comments/Spine';
import { buildNodes, nearestNode, type Node } from '@/ui/comments/nodes';
import { MenuRow } from '@/ui/comments/MenuRows';
import { COMMENTS, ZONE_BOTTOM, belowStatus } from '@/ui/comments/measures';
import { usePlayheadMs } from '@/ui/comments/usePlayhead';
import { useInsets } from '@/ui/comments/useInsets';

// M24 US20 (`Comments-B`): the capsule shows the three orders. The fourth, M19 FR-042's "Smart" (likes + 2 × replies − hours
// old / 12, social-core `smartScore`), lives in the "Order options" sheet beside the capsule with the M21 reverse switch.
const ORDERS: { value: CommentOrder; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'liked', label: 'Most liked' },
  { value: 'byMoment', label: 'By moment' },
];

/** Only the moment chip in the composer follows the playhead (M23 US7): it re-renders once per whole second. */
function Playhead(props: { episodeId: string | undefined; at: () => number | undefined; children: (atMs: number | undefined) => React.ReactElement }): React.ReactElement {
  usePlayheadMs(props.episodeId);
  return props.children(props.at());
}

/** The map follows the playhead on its own, so the list below does not re-render with it. */
function MapHost(props: { episodeId: string | undefined; heat: readonly number[] | undefined; durationMs: number | undefined; fallbackMs: number | undefined; listening: number | undefined; onJump: (fraction: number) => void }): React.ReactElement {
  const head = usePlayheadMs(props.episodeId) ?? props.fallbackMs;
  const played = props.durationMs && head !== undefined ? Math.min(1, Math.max(0, head / props.durationMs)) : 0;
  return <CommentsMap heat={props.heat} played={played} onJump={props.onJump} listening={props.listening} />;
}

export default function CommentsScreen(): React.ReactElement {
  const { episodeId, at } = useLocalSearchParams<{ episodeId: string; at?: string }>();
  const stores = useStores();
  const toast = useToast();
  const m12 = useM12Api();
  const extras = useCommentExtrasApi();
  const player = usePlayer();
  const insets = useInsets();
  const { api, composer, listener, useEpisodeSocial, refresh, bump } = useSocial();
  const safety = useSafety();
  usePoll(episodeId);
  const { cached, stale } = useEpisodeSocial(episodeId);
  const episode = episodeId ? stores.feeds.getEpisode(episodeId) : undefined;
  const [order, setOrderOnly] = useState<CommentOrder>('newest');
  // M21 US6: the active order's direction; a new order starts the way it reads by default.
  const [dir, setDir] = useState<CommentDir>(defaultDir('newest'));
  const [orderMenu, setOrderMenu] = useState(false);
  const setOrder = (o: CommentOrder) => { setOrderOnly(o); setDir(defaultDir(o)); };
  const [likes, setLikes] = useState<Record<string, LikeView>>({});
  const [menu, setMenu] = useState<Comment | undefined>();
  const [reporting, setReporting] = useState<ReportTarget | undefined>();
  const [composing, setComposing] = useState<ComposerState | undefined>();
  const [pictureFirst, setPictureFirst] = useState(false);
  const [, rerender] = useState(0);
  const [isHost, setIsHost] = useState(false);
  const [marked, setMarked] = useState<Record<string, true>>({});
  const [imagesOn, setImagesOn] = useState(false);
  const [zone, setZone] = useState(0);
  const list = useRef<RNFlatList<Node>>(null);

  // FR-040: Pin shows only for the show's proven host (the claim the server checks too).
  const feedUrl = episode?.feedUrl;
  useEffect(() => {
    if (!listener || !feedUrl) { setIsHost(false); return undefined; }
    let live = true;
    api.creatorClaims().then((r) => { if (live) setIsHost(Array.isArray(r) && r.some((x) => x.status === 'proven' && x.feedUrl === feedUrl)); }, () => undefined);
    return () => { live = false; };
  }, [api, listener, feedUrl]);
  // The picture button shows only where the server has pictures on (the composer sheet's own gate).
  useEffect(() => { let live = true; void extras.imagesOn().then((on) => { if (live) setImagesOn(on); }, () => undefined); return () => { live = false; }; }, [extras]);

  // The moment the listener came from (the player's position), else where they are in this episode.
  // M23 US7: read live when needed; only the small write box below follows the playhead.
  const atNow = (): number | undefined => at !== undefined && at !== '' && !Number.isNaN(Number(at)) ? Number(at)
    : livePositionMs(player, episodeId) ?? stores.positions.get(episodeId ?? '')?.offsetMs;

  const visible = useMemo(() => safety.comments(cached?.social.comments ?? []), [cached, safety]);
  const count = visible.reduce((n, x) => n + (x.deleted ? 0 : 1) + (x.replies ?? []).filter((r) => !r.deleted).length, 0);
  const ordered = useMemo(
    () => orderComments(visible.map((x) => ({ ...x, createdAt: new Date(x.createdAt).getTime(), likeCount: likes[x.id]?.count ?? x.likeCount ?? 0, replyCount: replyCountOf(x), pinned: extrasOf(x).pinned === true, pinnedBottom: (x as Comment & { pinnedBottom?: true }).pinnedBottom === true, raw: x })), order, Date.now(), dir).map((o) => o.raw),
    [visible, order, dir, likes],
  );
  const likeOf = useCallback((x: Comment): LikeView => likes[x.id] ?? { count: x.likeCount ?? 0, liked: x.likedByMe ?? false }, [likes]);
  const nodes = useMemo(() => buildNodes(ordered, order === 'byMoment', (c) => likeOf(c).count), [ordered, order, likeOf]);
  // M21 US6: "N listening now" — read only here (the player sends the heartbeat); the map draws it at its right end.
  const listeningCount = useListeningNow(episodeId, false);
  const listening = liveLabel(listeningCount) !== undefined ? listeningCount : undefined;
  const heat = cached?.social.heat.available ? cached.social.heat.buckets : undefined;
  const durationMs = episode?.durationMs ?? cached?.social.episode.durationMs ?? undefined;

  const needSignIn = () => router.push('/auth/sign-in');
  const compose = (parentId?: string, withPicture = false) => {
    if (!listener) { needSignIn(); return; }
    if (!episodeId) return;
    setPictureFirst(withPicture);
    setComposing(composer.open({ episodeId, offsetMs: atNow() ?? 0, ...(episode?.durationMs !== undefined ? { durationMs: episode.durationMs } : {}) }, parentId));
  };
  const seek = (offsetMs: number) => {
    if (!episodeId) return;
    if (episodePlayView(player.getState(), episodeId).loaded) { player.seek(offsetMs); player.play(); return; }
    const playable = toPlayable(stores, episodeId);
    if (playable) { player.load(playable, 'play'); player.seek(offsetMs); }
  };
  // The map: a touch asks for that share of the episode; the thread scrolls to the moment nearest it.
  const jump = useCallback((fraction: number) => {
    if (!durationMs) return;
    const i = nearestNode(nodes, fraction * durationMs);
    if (i >= 0) list.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0 });
  }, [durationMs, nodes]);
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

  // FR-040: the host pins one top-level comment (the server unpins any other).
  const pin = async (x: Comment, on: boolean) => {
    if (!episodeId) return;
    try {
      if (on) await extras.pin(x.id); else await extras.unpin(x.id);
      toast(on ? 'Pinned to the top.' : 'Unpinned.');
      void refresh(episodeId);
    } catch { toast(on ? "Couldn't pin that comment." : "Couldn't unpin that comment."); }
  };
  // M22 US10 (FR-030): the host pins one top-level comment to the bottom — last under every order.
  const m22 = useM22Api();
  const pinBottom = async (x: Comment, on: boolean) => {
    if (!episodeId) return;
    try {
      await m22.pinBottom(x.id, on);
      toast(on ? 'Pinned to the bottom.' : 'Unpinned from the bottom.');
      void refresh(episodeId);
    } catch { toast("Couldn't change that pin — try again."); }
  };
  // FR-041: one mark per listener; at 5 the comment folds for everyone. Voters are never shown.
  const markUnfriendly = async (x: Comment, on: boolean) => {
    if (!listener) { needSignIn(); return; }
    if (!episodeId) return;
    try {
      const r = on ? await extras.markUnfriendly(x.id) : await extras.unmarkUnfriendly(x.id);
      setMarked((m) => { const n = { ...m }; if (on) n[x.id] = true; else delete n[x.id]; return n; });
      toast(on ? (r.folded ? 'Marked. It is now hidden for everyone.' : 'Marked as unfriendly. Thank you.') : 'Mark removed.');
      void refresh(episodeId);
    } catch { toast("Couldn't save that — try again."); }
  };

  // M21 US6: the episode's link at the comment's moment, with its words.
  const shareComment = (x: Comment) => {
    if (!episodeId) return;
    const url = m12.episodePageUrl(episodeId, x.offsetMs ?? undefined);
    const words = x.body ? `${x.displayName ?? 'A listener'}: “${x.body}”\n` : '';
    void Share.share({ message: `${words}${episode?.title ?? ''}\n${url}`, url }).catch(() => undefined);
  };
  // M21 US6 (G-M21-6): their comments go from this listener's pages only; they are never told.
  const mute = async (x: Comment) => {
    if (!listener) { needSignIn(); return; }
    if (!x.authorId || !episodeId) return;
    try {
      await extras.mute(x.authorId);
      toast(`Muted ${x.displayName ?? 'this listener'}. Unmute from their profile.`);
      void refresh(episodeId);
    } catch { toast("Couldn't mute — try again."); }
  };

  // M22 US3 (FR-012): the author stops (or restarts) like notices on one comment; this phone remembers which.
  const m22Social = useM22SocialApi();
  const likesOffKey = (id: string) => `m22.likeNoticesOff.${id}`;
  const toggleLikeNotices = (x: Comment) => {
    const off = stores.settings.get(likesOffKey(x.id)) !== '1';
    m22Social.setLikeNotices(x.id, off).then(() => {
      stores.settings.set(likesOffKey(x.id), off ? '1' : '0');
      rerender((n) => n + 1);
      toast(off ? 'Like notices stopped for this comment. Replies still notify you.' : 'Like notices are back on for this comment.');
    }, () => toast("Couldn't change that — try again."));
  };

  // The drawing's visitor menu has no Reply (the card's own "Reply" sends them to sign-in); Mute and Mark need an account.
  const menuItems = (x: Comment): MenuItem[] => [
    ...(x.parentId === null && listener ? [{ label: 'Reply', run: () => compose(x.id) }] : []),
    { label: 'Share', run: () => shareComment(x) },
    ...(x.body ? [{ label: 'Copy', run: () => { Clipboard.setString(x.body ?? ''); toast('Copied.'); } }] : []),
    ...(x.body && episodeId ? [{
      label: isFavComment(stores.settings, x.id) ? 'Remove from saved' : 'Save',
      run: () => { toggleFavComment(stores.settings, { commentId: x.id, episodeId, body: x.body ?? '', author: x.displayName ?? 'A listener', offsetMs: x.offsetMs }, Date.now()); rerender((n) => n + 1); },
    }] : []),
    ...(isHost && x.parentId === null ? [{ label: extrasOf(x).pinned ? 'Unpin' : 'Pin', run: () => void pin(x, !extrasOf(x).pinned) }] : []),
    ...(x.mine && listener ? [{ label: stores.settings.get(likesOffKey(x.id)) === '1' ? 'Turn like notices back on' : 'Stop like notices', run: () => toggleLikeNotices(x) }] : []),
    ...(isHost && x.parentId === null ? [{ label: (x as Comment & { pinnedBottom?: true }).pinnedBottom ? 'Unpin from bottom' : 'Pin to bottom', run: () => void pinBottom(x, !(x as Comment & { pinnedBottom?: true }).pinnedBottom) }] : []),
    ...(!x.mine && listener && x.authorId ? [{ label: 'Mute', run: () => void mute(x) }] : []),
    ...(!x.mine && listener ? [{ label: marked[x.id] ? 'Unmark' : 'Mark as unfriendly', run: () => void markUnfriendly(x, !marked[x.id]) }] : []),
    x.mine
      ? { label: 'Delete', run: () => void remove(x) }
      : { label: 'Report', run: () => setReporting({ kind: 'comment', id: x.id, authorId: x.authorId, label: 'comment' }) },
  ];

  const serverTime = cached?.social.serverTime ?? new Date().toISOString();
  const top = (drawn: number) => belowStatus(insets.top, drawn);
  // First load: the ghost rows, until the page has waited as long as the shared empty states do (10 s) or the server said no.
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    if (cached !== undefined) return undefined;
    const t0 = Date.now();
    const timer = setInterval(() => setWaited(Date.now() - t0), 1000);
    return () => clearInterval(timer);
  }, [cached]);
  const loading = cached === undefined && !stale && waited < GIVE_UP_AFTER_MS;
  const failedLoad = cached === undefined && !loading;
  const empty = cached !== undefined && nodes.length === 0;
  const smartOn = order === 'smart';
  const reversed = dir !== defaultDir(order);

  return (
    <Box className="flex-1 bg-void">
      {/* Top: the episode strip, then the map of the whole episode with who is listening now. */}
      <Box className="absolute left-0 right-0" style={{ top: top(56), zIndex: 5 }} testID="comments-strip">
        {episodeId ? <EpisodeCard episodeId={episodeId} /> : null}
      </Box>
      <Box className="absolute" style={{ left: COMMENTS.gutter, right: COMMENTS.gutter, top: top(102), zIndex: 5 }} testID="comments-map-row">
        <MapHost episodeId={episodeId} heat={heat} durationMs={durationMs} fallbackMs={stores.positions.get(episodeId ?? '')?.offsetMs} listening={listening} onJump={jump} />
      </Box>
      {stale ? <Type step="tag" className="absolute text-text3" style={{ left: COMMENTS.gutter, top: top(102) + COMMENTS.mapHeight + 2, zIndex: 5 }}>Couldn't refresh — showing the last copy</Type> : null}
      {/* The spine and the thread. */}
      <Box className="absolute left-0 right-0 bottom-0 overflow-hidden" style={{ top: top(140), zIndex: 3 }} testID="comments-thread">
        {failedLoad ? (
          // Nothing cached and the server did not answer: the shared offline / error block, with Retry.
          <Box className="absolute left-0 right-0" style={{ top: 0, bottom: zone }}>
            <EmptyState surface="comments" page failed onRetry={() => { if (episodeId) void refresh(episodeId); }} />
          </Box>
        ) : empty ? (
          <Box className="absolute" style={{ left: 24, right: 24, top: 110 }}>
            <EmptyState surface="comments" page action={{ label: 'Comment here', onPress: () => compose() }} />
          </Box>
        ) : loading ? (
          <Box style={{ paddingTop: COMMENTS.listTop, paddingRight: COMMENTS.listRight }}><GhostRows /></Box>
        ) : (
          <>
            <SpineLine />
            <FlatList
              ref={list}
              data={nodes}
              keyExtractor={(n) => n.key}
              contentContainerStyle={{ paddingTop: COMMENTS.listTop, paddingLeft: COMMENTS.listLeft, paddingRight: COMMENTS.listRight, paddingBottom: zone + 24, gap: COMMENTS.nodeGap }}
              // Owner, 2026-10-05: the bottom of a fetched list says so ("That's all", a tick on the spine).
              ListFooterComponent={<Box className="flex-row items-center" style={{ width: COMMENTS.chipColumn, justifyContent: 'center' }}><Tick text="That's all" /></Box>}
              onScrollToIndexFailed={(info) => { list.current?.scrollToOffset({ offset: Math.max(0, info.averageItemLength * info.index), animated: true }); }}
              renderItem={({ item }) => (
                <SpineNode momentMs={item.momentMs} reacted={item.reacted} onSeek={seek}>
                  {item.comments.map((c) => (
                    <CommentRow
                      key={c.id}
                      c={c}
                      serverTime={serverTime}
                      likeOf={likeOf}
                      onSeek={seek}
                      onLike={(x) => void like(x)}
                      onMenu={setMenu}
                      onReply={(x) => compose(x.id)}
                      playVoice={playVoice}
                      teenMode={getPref(stores.settings, 'hideExplicit')}
                      ringed={composing?.parentId === c.id}
                      onOpenThread={(x) => router.push({ pathname: '/comments/thread/[commentId]', params: { commentId: x.id, episodeId: episodeId ?? '' } })}
                    />
                  ))}
                </SpineNode>
              )}
            />
          </>
        )}
      </Box>
      <Fade bottom={0} height={COMMENTS.fullHeight + 90} />
      {/* The thumb zone: close and the title, the order capsule, the composer. FR-021: it stays at the bottom and carries the moment. */}
      <BottomZone bottom={ZONE_BOTTOM}>
        <Box onLayout={(e) => setZone(e.nativeEvent.layout.height + ZONE_BOTTOM)}>
          <Box style={{ gap: COMMENTS.zoneGap }}>
            <ZoneTitle title="Comments" count={count} back={{ icon: 'chevron-down', label: 'Close', onPress: goBack }} />
            <Box className="flex-row items-center" style={{ gap: 8, paddingHorizontal: COMMENTS.titleRowPad }}>
              <Capsule items={ORDERS} value={order === 'smart' ? 'newest' : order} onChange={setOrder} />
              {/* M24 US20: "Smart" order and M21 US6's reverse switch live in the small sheet this opens. */}
              <IconButton icon="options-outline" label={order === 'smart' ? 'Order options, Smart order on' : 'Order options'} onPress={() => setOrderMenu(true)} fill selected={smartOn || reversed} size={18} diameter={COMMENTS.optionsCircle} />
            </Box>
            {listener ? (
              // M19 FR-044: the mic inside the bar records a voice comment at the same moment.
              <VoiceComposer episodeId={episodeId ?? ''} offsetMs={() => livePositionMs(player, episodeId)} onPosted={() => { if (episodeId) void refresh(episodeId); }}>
                {(mic) => (
                  <Playhead episodeId={episodeId} at={atNow}>{(atMs) => (
                    <ComposerBar
                      {...(atMs !== undefined ? { moment: mmss(atMs) } : {})}
                      placeholder="Say something about this episode…"
                      accessibilityLabel={`Write a comment${atMs !== undefined ? ` at ${mmss(atMs)}` : ''}`}
                      onOpen={() => compose()}
                      mic={mic}
                      {...(imagesOn ? { onImage: () => compose(undefined, true) } : {})}
                    />
                  )}</Playhead>
                )}
              </VoiceComposer>
            ) : <SignInBar label="Sign in to join the conversation" onPress={needSignIn} />}
          </Box>
        </Box>
      </BottomZone>
      <ActionSheet open={orderMenu} onClose={() => setOrderMenu(false)} label="Order" title="Order">
        {/* Drawn (`social.html` `comments--order-options-sheet`): the two rows and a 6 tall spacer are direct children of the sheet,
            so the sheet's 14 gap falls between the rows and above the foot (the wave-2 capture: 225 built vs 259 drawn). */}
        <MenuRow
          icon="sparkles-outline"
          label="Smart order"
          detail={smartOn ? 'On' : 'Likes, replies, new'}
          on={smartOn}
          onPress={() => { setOrder(smartOn ? 'newest' : 'smart'); setOrderMenu(false); }}
        />
        <MenuRow
          icon={dir === 'asc' ? 'arrow-up-outline' : 'arrow-down-outline'}
          label="Reverse order"
          detail={reversed ? 'On' : 'Off'}
          on={reversed}
          onPress={() => { setDir((d) => (d === 'asc' ? 'desc' : 'asc')); setOrderMenu(false); }}
        />
        <Box testID="order-sheet-foot" style={{ height: COMMENTS.orderFoot }} />
      </ActionSheet>
      <CommentMenu comment={menu} items={menu ? menuItems(menu) : []} onClose={() => setMenu(undefined)} />
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
      {composing ? <ComposerSheet initial={composing} pickPicture={pictureFirst} onClose={() => setComposing(undefined)} onPosted={() => { if (episodeId) void refresh(episodeId); }} /> : null}
    </Box>
  );
}
