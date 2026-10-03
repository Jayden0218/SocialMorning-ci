/**
 * What a rail marker opens: the comment(s) at that second, with Delete on the
 * listener's own (FR-010) and Reply (one level, US2 #4). Replies-to-replies are
 * never offered: a reply row has no Reply button. Someone else's comment has Report
 * (iOS i8: only the episode page offered it). M9: a gluestack Actionsheet; every action is
 * at least 44 pt (iOS i4: Close, Reply and Delete were 36–42 × 17).
 *
 * M17 T101 (`MomentSheet-B`): an accent eyebrow with the comment count over the moment as a
 * 32 pt serif title, Close as a round bordered button; each comment is an initials disc beside
 * a bubble (name, then the words), with Reply / Delete / Report under it as icon + word, and
 * replies indented under their comment. Every action, label and handler is unchanged; every
 * one is now 48 pt (was 44).
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { plural } from '@socialmorning/social-core';
import { KeyboardAvoidingView } from '@/ui/lib/keyboard-avoiding-view';
import { Pressable } from '@/ui/lib/pressable';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper, ActionsheetScrollView } from '@/ui/lib/actionsheet';
import { ReportSheet, type ReportTarget } from './ReportSheet';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { initialOf } from './Artwork';
import { Eyebrow } from './Eyebrow';
import { Icon } from './Icon';
import { useColours } from './useColours';
import { mmss } from './format';
import { hit } from '@/design';
import { useSocial } from '@/social/context';
import type { Comment } from '@/social/api';

/** The 48 pt minimum, in both directions (iOS i4; M17 rule: 48, was 44). */
const TAP = { minHeight: hit.min, minWidth: hit.min };
/** An action under a bubble: icon + word, on one line. */
const ACTION = 'flex-row items-center gap-1 justify-center';
/** The initials disc: 36 pt for a comment, 28 for a reply. Sizes, so styles. */
const DISC = { width: 36, height: 36 };
const DISC_REPLY = { width: 28, height: 28 };

/** How many comments this moment holds, replies included, deleted ones left out. */
function countOf(comments: readonly Comment[]): number {
  return comments.reduce((n, c) => n + (c.deleted ? 0 : 1) + (c.replies ?? []).filter((r) => !r.deleted).length, 0);
}

export function MomentSheet(props: {
  episodeId: string;
  title: string;
  comments: Comment[];
  onClose: () => void;
  onReply: (parentId: string) => void;
}): React.ReactElement {
  const { composer, listener, bump } = useSocial();
  const colours = useColours();
  const [busy, setBusy] = useState<string | undefined>();
  const [reporting, setReporting] = useState<ReportTarget | undefined>();
  // Nothing left at this moment (the listener deleted the only comment): close.
  useEffect(() => { if (props.comments.length === 0) props.onClose(); }, [props.comments.length, props.onClose]);

  async function remove(id: string) {
    setBusy(id);
    try {
      await composer.remove(props.episodeId, id);
      bump(props.episodeId);
    } finally {
      setBusy(undefined);
    }
  }

  const Row = ({ c, isReply }: { c: Comment; isReply: boolean }) => (
    <Box className={`gap-1 ${isReply ? 'ml-12 mt-2' : 'mt-section'}`}>
      <Box className="flex-row items-start gap-row">
        <Box className="rounded-pill bg-accentTint items-center justify-center" style={isReply ? DISC_REPLY : DISC} accessible={false}>
          <Text className="text-text text-xs font-bold">{c.initials ?? (initialOf(c.displayName ?? '') || '·')}</Text>
        </Box>
        <Box className="flex-1 bg-background border border-border rounded-row px-section py-row gap-0.5">
          {c.deleted ? (
            <Text className="text-muted text-body">Comment deleted</Text>
          ) : (
            <>
              <Text className="text-meta font-bold text-text">
                {c.displayName ?? 'Deleted account'}
                {c.offsetMs !== null ? <Text className="text-meta font-medium text-muted"> · {mmss(c.offsetMs)}</Text> : null}
              </Text>
              <Text className="text-body text-text">{c.body}</Text>
            </>
          )}
        </Box>
      </Box>
      {c.deleted ? null : (
        <Box className={`flex-row gap-section ${isReply ? 'ml-10' : 'ml-12'}`}>
          {!isReply ? (
            <Pressable onPress={() => (listener ? props.onReply(c.id) : router.push('/auth/sign-in'))} accessibilityRole="button" className={ACTION} style={TAP}>
              <Icon name="arrow-undo-outline" size={16} color={colours.accent} />
              <Text className="text-accent text-meta font-bold">Reply</Text>
            </Pressable>
          ) : null}
          {c.mine ? (
            <Pressable disabled={busy === c.id} onPress={() => remove(c.id)} accessibilityRole="button" className={ACTION} style={TAP}>
              <Icon name="trash-outline" size={16} color={colours.accent} />
              <Text className="text-accent text-meta font-bold">{busy === c.id ? 'Deleting…' : 'Delete'}</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => setReporting({ kind: 'comment', id: c.id, authorId: c.authorId, label: 'comment' })} accessibilityRole="button" accessibilityLabel="Report this comment" className={ACTION} style={TAP}>
              <Icon name="flag-outline" size={16} color={colours.muted} />
              <Text className="text-muted text-meta font-medium">Report</Text>
            </Pressable>
          )}
        </Box>
      )}
      {c.replies?.map((r) => <Row key={r.id} c={r} isReply />)}
    </Box>
  );

  return (
    <>
      <Actionsheet isOpen onClose={props.onClose}>
        <ActionsheetBackdrop />
        <KeyboardAvoidingView className="w-full justify-end" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ActionsheetContent className="bg-surface px-screen-x pt-2 rounded-t-row max-h-[70%] items-stretch">
            <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
            <Box className="flex-row justify-between items-end gap-row pt-2">
              <Box className="flex-1 gap-1">
                <Eyebrow accent>{plural(countOf(props.comments), 'comment')}</Eyebrow>
                <Text className="text-display font-display text-text" accessibilityRole="header" numberOfLines={1}>{props.title}</Text>
              </Box>
              <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Close" className="rounded-pill border border-border bg-surface items-center justify-center" style={TAP}>
                <Icon name="close" size={22} color={colours.text} />
              </Pressable>
            </Box>
            <ActionsheetScrollView className="grow-0">
              {props.comments.map((c) => <Row key={c.id} c={c} isReply={false} />)}
            </ActionsheetScrollView>
          </ActionsheetContent>
        </KeyboardAvoidingView>
      </Actionsheet>
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} onReported={props.onClose} />
    </>
  );
}
