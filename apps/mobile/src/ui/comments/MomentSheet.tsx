// Sheet with the comments at one moment; reply, delete, report or like.
/**
 * What a rail marker opens: the comment(s) at that second, with Delete on the
 * listener's own (FR-010) and Reply (one level, US2 #4). Replies-to-replies are
 * never offered: a reply row has no Reply button. Someone else's comment has Report
 * (iOS i8: only the episode page offered it). Every action is at least 44 pt (iOS i4).
 *
 * M31 W2-B (`social.html` `moment-sheet--player-marker`): the kit sheet. Head: the solid moment chip, "At 14:32" in Unbounded
 * 800 24, a 36 close circle. Below it a Thread in miniature — a 2 px hot-to-violet spine 6 in from the left, and each comment a
 * raise card (radius 18, padding 12): a 22 avatar, the name, "· 14:32" in mono 11, the words (Body 15/21) and a row of Reply
 * and Delete (yours) or Report (others', with the flag) in 13/600, the heart with its count at the right (a tap likes; signed
 * out it goes to sign-in). A reply sits under its comment, stepped in. "All comments ›" (a quiet 48 pill) opens the Comments
 * page at this moment. Every other action, label and handler is as before.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';
import { LinearGradient } from '@/design/tailwind';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Avatar } from '@/ui/kit/Avatar';
import { BusyContent } from '@/ui/kit/BusyContent';
import { Icon } from '@/ui/kit/Icon';
import { IconButton, PulseButton } from '@/ui/kit/PulseButton';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { mmss } from '@/ui/kit/format';
import { colour } from '@/design';
import { plural } from '@socialmorning/social-core';
import { useSocial } from '@/social/context';
import { useM12Api } from '@/social/m12-api';
import type { Comment } from '@/social/api';
import { useToast } from '@/ui/shell/providers';
import { ReportSheet, type ReportTarget } from './ReportSheet';
import { COMMENTS } from './measures';
import { drawnType } from '@/design/type-px';

/** An action under a card: 13/600 words, a 48 tap by hitSlop. */
const SLOP = { top: 16, bottom: 16, left: 0, right: 0 };
/** 16 tall + 16 + 16 of slop = 48; at least 48 wide. The drawing's row is 13 pt of words. */
const TAP = { minWidth: 48, minHeight: 16 };
const CARD = { borderRadius: COMMENTS.cardRadius, padding: COMMENTS.cardPad, gap: 6 };
const SPINE_COLOURS = [colour.hot, colour.violet] as const;

export function MomentSheet(props: {
  episodeId: string;
  title: string;
  comments: Comment[];
  onClose: () => void;
  onReply: (parentId: string) => void;
}): React.ReactElement {
  const { composer, listener, bump } = useSocial();
  const m12 = useM12Api();
  const toast = useToast();
  const { height } = useWindowDimensions();
  const [busy, setBusy] = useState<string | undefined>();
  const [reporting, setReporting] = useState<ReportTarget | undefined>();
  const [likes, setLikes] = useState<Record<string, { count: number; liked: boolean }>>({});
  // Nothing left at this moment (the listener deleted the only comment): close.
  const { onClose } = props;
  const commentCount = props.comments.length;
  useEffect(() => { if (commentCount === 0) onClose(); }, [commentCount, onClose]);
  const at = props.comments.find((c) => c.offsetMs !== null)?.offsetMs ?? null;

  async function remove(id: string) {
    setBusy(id);
    try {
      await composer.remove(props.episodeId, id);
      bump(props.episodeId);
    } finally {
      setBusy(undefined);
    }
  }
  const likeOf = (x: Comment) => likes[x.id] ?? { count: x.likeCount ?? 0, liked: x.likedByMe ?? false };
  const like = async (x: Comment) => {
    if (!listener) { router.push('/auth/sign-in'); return; }
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
  const openAll = () => {
    props.onClose();
    router.push({ pathname: '/comments/[episodeId]', params: { episodeId: props.episodeId, ...(at !== null ? { at: String(at) } : {}) } });
  };

  const Row = ({ c, isReply }: { c: Comment; isReply: boolean }) => {
    const l = likeOf(c);
    return (
      <Box style={isReply ? { marginLeft: 16, marginTop: 10 } : { marginTop: 10 }}>
        <Box className="bg-raise" style={CARD}>
          {c.deleted ? (
            <Type step="caption" className="text-text3 italic">Comment deleted</Type>
          ) : (
            <>
              <Box className="flex-row items-center" style={{ gap: 8 }}>
                <Avatar size={COMMENTS.quoteAvatar} url={c.avatarUrl} name={c.displayName} />
                <Type step="caption" className="text-text font-semibold flex-shrink" numberOfLines={1}>{c.mine ? 'You' : c.displayName ?? 'Deleted account'}</Type>
                {c.offsetMs !== null ? <Type step="tag" className="text-text3">{`· ${mmss(c.offsetMs)}`}</Type> : null}
              </Box>
              <Type step="body" className="text-text" style={drawnType.momentBody}>{c.body}</Type>
              <Box className="flex-row items-center" style={{ gap: COMMENTS.actionGap }}>
                {!isReply ? (
                  <Pressable onPress={() => (listener ? props.onReply(c.id) : router.push('/auth/sign-in'))} accessibilityRole="button" accessibilityLabel="Reply" hitSlop={SLOP} style={TAP}>
                    <Type step="caption" className="text-hotText font-semibold">Reply</Type>
                  </Pressable>
                ) : null}
                {c.mine ? (
                  <Pressable disabled={busy === c.id} onPress={() => remove(c.id)} accessibilityRole="button" accessibilityLabel="Delete" accessibilityState={{ busy: busy === c.id }} hitSlop={SLOP} style={TAP}>
                    <BusyContent busy={busy === c.id} size={12} className="flex-row items-center">
                      <Type step="caption" className="text-hotText font-semibold">Delete</Type>
                    </BusyContent>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => setReporting({ kind: 'comment', id: c.id, authorId: c.authorId, label: 'comment' })} accessibilityRole="button" accessibilityLabel="Report this comment" hitSlop={SLOP} className="flex-row items-center" style={[TAP, { gap: 4 }]}>
                    <Icon name="flag-outline" size={14} color={colour.text2} />
                    <Type step="caption" className="text-text2 font-semibold">Report</Type>
                  </Pressable>
                )}
                <Box className="flex-1" />
                {c.mine ? (
                  l.count > 0 ? <Box className="flex-row items-center" style={{ gap: 4 }}><Icon name="heart-outline" size={14} color={colour.text2} /><Type step="mono" className="text-text2">{l.count}</Type></Box> : null
                ) : (
                  <Pressable onPress={() => void like(c)} accessibilityRole="button" accessibilityState={{ selected: l.liked }} accessibilityLabel={`${l.liked ? 'Unlike' : 'Like'}. ${plural(l.count, 'like')}`} hitSlop={SLOP} className="flex-row items-center justify-end" style={[TAP, { gap: 4 }]}>
                    <Icon name={l.liked ? 'heart' : 'heart-outline'} size={14} color={l.liked ? colour.hotText : colour.text2} />
                    {l.count > 0 ? <Type step="mono" className={l.liked ? 'text-hotText' : 'text-text2'}>{l.count}</Type> : null}
                  </Pressable>
                )}
              </Box>
            </>
          )}
        </Box>
        {c.replies?.map((r) => <Row key={r.id} c={r} isReply />)}
      </Box>
    );
  };

  return (
    <>
      <ActionSheet open onClose={props.onClose} label={props.title}>
        <Box className="flex-row items-center" style={{ gap: 10 }}>
          {at !== null ? <Box><TimestampChip text={mmss(at)} solid /></Box> : null}
          <Type step="statement" className="text-text flex-1" accessibilityRole="header" numberOfLines={1}>{props.title}</Type>
          <IconButton icon="close" label="Close" onPress={props.onClose} fill size={18} diameter={36} />
        </Box>
        <ScrollView style={{ maxHeight: Math.round(height * 0.5) }} showsVerticalScrollIndicator={false} bounces={false}>
          <Box style={{ paddingLeft: COMMENTS.momentSpineIndent }}>
            <LinearGradient colors={SPINE_COLOURS} pointerEvents="none" style={{ position: 'absolute', left: COMMENTS.momentSpineLeft, top: 4, bottom: 4, width: COMMENTS.spineWidth }} />
            {props.comments.map((c) => <Row key={c.id} c={c} isReply={false} />)}
          </Box>
        </ScrollView>
        <PulseButton label="All comments ›" accessibilityLabel="All comments" kind="quiet" onPress={openAll} full />
      </ActionSheet>
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} onReported={props.onClose} />
    </>
  );
}
