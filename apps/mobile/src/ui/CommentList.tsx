/**
 * The conversation (US4): top-level comments in "Newest" or "By moment" order,
 * replies one level under their parent, oldest first. Readable signed out; every
 * write control asks to sign in (FR-022, US4 #4). Tapping a moment chip plays
 * the episode from there.
 */
import { router } from 'expo-router';
import { Link } from '../design/tailwind';
import { useMemo, useState } from 'react';
import { Pressable } from './lib/pressable';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { orderComments, type CommentOrder } from '@socialmorning/social-core';
import { mmss, relativeTime } from './format';
import { useSocial } from '../social/context';
import { useSafety } from '../safety/context';
import { Placeholder, placeholderFor } from './Placeholder';
import { ReportSheet, type ReportTarget } from './ReportSheet';
import type { Comment } from '../social/api';
import { EmptyState } from './EmptyState';
import { useStores } from './providers';
import { isFavComment, toggleFavComment } from '../me/fav-comments';

export function CommentList(props: {
  episodeId: string;
  comments: Comment[];
  serverTime: string;
  stale: boolean;
  onSeek: (offsetMs: number) => void;
  onReply: (parentId: string) => void;
  onCompose: () => void;
}): React.ReactElement {
  const { composer, listener, bump } = useSocial();
  const safety = useSafety();
  const [order, setOrder] = useState<CommentOrder>('newest');
  const [busy, setBusy] = useState<string | undefined>();
  const [reporting, setReporting] = useState<ReportTarget | undefined>();
  // M10b US2 (FR-005): star a comment; it appears under Favourites → Comments.
  const stores = useStores();
  const [, starred] = useState(0);
  const star = (c: Comment) => {
    toggleFavComment(stores.settings, { commentId: c.id, episodeId: props.episodeId, body: c.body ?? '', author: c.displayName ?? 'A listener', offsetMs: c.offsetMs }, Date.now());
    starred((n) => n + 1);
  };

  // M6 (R1): the phone's own blocks and reports apply before anything renders — instant, offline.
  const visible = useMemo(() => safety.comments(props.comments), [props.comments, safety]);
  const ordered = useMemo(
    () => orderComments(visible.map((c) => ({ ...c, createdAt: new Date(c.createdAt).getTime(), raw: c })), order),
    [visible, order],
  );

  const needSignIn = () => router.push('/auth/sign-in');

  async function remove(id: string) {
    setBusy(id);
    try { await composer.remove(props.episodeId, id); bump(props.episodeId); } finally { setBusy(undefined); }
  }

  const Row = ({ c, isReply }: { c: Comment; isReply: boolean }) => (
    <Box className={`py-2 gap-1 border-separator ${isReply ? 'ml-4 border-b-0' : 'border-b-hairline'}`}>
      {placeholderFor(c, c.reported) !== undefined ? (
        <Placeholder kind={placeholderFor(c, c.reported)!} />
      ) : (
        <>
          <Box className="flex-row gap-2 items-center flex-wrap">
            {c.authorId !== null ? (
              <Link href={{ pathname: '/profile/[id]', params: { id: c.authorId } }} asChild>
                <Pressable accessibilityRole="link"><Text className="font-semibold text-text">{c.displayName ?? 'Deleted account'}</Text></Pressable>
              </Link>
            ) : <Text className="font-semibold text-text">{c.displayName ?? 'Deleted account'}</Text>}
            {c.host ? <Text className="bg-surface text-accent rounded-pill px-2 py-0.5 text-xs font-bold" accessibilityLabel="Host of this show">Host</Text> : null}
            {c.offsetMs !== null ? (
              <Pressable onPress={() => props.onSeek(c.offsetMs!)} accessibilityRole="button" accessibilityLabel={`Play from ${mmss(c.offsetMs)}`}>
                <Text className="bg-surface text-accent rounded-pill px-2 py-0.5 text-xs font-semibold">{mmss(c.offsetMs)}</Text>
              </Pressable>
            ) : null}
            <Text className="text-muted text-[13px]">{relativeTime(c.createdAt, props.serverTime)}</Text>
          </Box>
          <Text className="text-[15px] text-text">{c.body}</Text>
          {c.hiddenByHost ? <Text className="text-muted text-[13px] italic">Hidden by the host — only you can see it</Text> : null}
          <Box className="flex-row gap-4">
            {!isReply ? (
              <Pressable onPress={() => (listener ? props.onReply(c.id) : needSignIn())} accessibilityRole="button">
                <Text className="text-accent text-[14px]">{listener ? 'Reply' : 'Sign in to reply'}</Text>
              </Pressable>
            ) : null}
            {c.body ? (
              <Pressable onPress={() => star(c)} accessibilityRole="button" accessibilityState={{ selected: isFavComment(stores.settings, c.id) }} accessibilityLabel={isFavComment(stores.settings, c.id) ? 'Remove this comment from favourites' : 'Add this comment to favourites'}>
                <Text className="text-accent text-[14px]">{isFavComment(stores.settings, c.id) ? '★' : '☆'}</Text>
              </Pressable>
            ) : null}
            {c.mine ? (
              <Pressable disabled={busy === c.id} onPress={() => remove(c.id)} accessibilityRole="button" accessibilityLabel="Delete this comment">
                <Text className="text-accent text-[14px]">{busy === c.id ? 'Deleting…' : 'Delete'}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => setReporting({ kind: 'comment', id: c.id, authorId: c.authorId, label: 'comment' })} accessibilityRole="button" accessibilityLabel="Report this comment">
                <Text className="text-muted text-[13px]">Report</Text>
              </Pressable>
            )}
          </Box>
        </>
      )}
      {c.replies?.map((r) => <Row key={r.id} c={r} isReply />)}
    </Box>
  );

  return (
    <Box className="gap-1.5 mt-3">
      <Box className="flex-row justify-between items-center">
        <Text className="text-[17px] font-bold text-text">Comments</Text>
        <Box className="flex-row gap-3">
          {(['newest', 'byMoment'] as const).map((o) => (
            <Pressable key={o} onPress={() => setOrder(o)} accessibilityRole="button" accessibilityState={{ selected: order === o }}>
              <Text className={order === o ? 'text-[14px] text-text font-bold underline' : 'text-[14px] text-muted'}>{o === 'newest' ? 'Newest' : 'By moment'}</Text>
            </Pressable>
          ))}
        </Box>
      </Box>
      {props.stale ? <Text className="text-muted text-[13px]">Couldn't refresh — showing the last copy</Text> : null}
      <Pressable className="py-1.5" onPress={() => (listener ? props.onCompose() : needSignIn())} accessibilityRole="button">
        <Text className="text-accent text-[14px]">{listener ? 'Write a comment' : 'Sign in to join the conversation'}</Text>
      </Pressable>
      {ordered.length === 0 ? <EmptyState surface="comments" action={{ label: 'Comment here', onPress: () => (listener ? props.onCompose() : needSignIn()) }} /> : null}
      {ordered.map((o) => <Row key={o.raw.id} c={o.raw} isReply={false} />)}
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
    </Box>
  );
}

