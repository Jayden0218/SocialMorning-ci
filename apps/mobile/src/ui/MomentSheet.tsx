/**
 * What a rail marker opens: the comment(s) at that second, with Delete on the
 * listener's own (FR-010) and Reply (one level, US2 #4). Replies-to-replies are
 * never offered: a reply row has no Reply button. Someone else's comment has Report
 * (iOS i8: only the episode page offered it). M9: a gluestack Actionsheet; every action is
 * at least 44 pt (iOS i4: Close, Reply and Delete were 36–42 × 17).
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { KeyboardAvoidingView } from './lib/keyboard-avoiding-view';
import { Pressable } from './lib/pressable';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper, ActionsheetScrollView } from './lib/actionsheet';
import { ReportSheet, type ReportTarget } from './ReportSheet';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { mmss } from './format';
import { useSocial } from '../social/context';
import type { Comment } from '../social/api';

/** Apple's 44 pt minimum, in both directions (iOS i4). */
const TAP = 'min-h-[44px] min-w-[44px] justify-center';

export function MomentSheet(props: {
  episodeId: string;
  title: string;
  comments: Comment[];
  onClose: () => void;
  onReply: (parentId: string) => void;
}): React.ReactElement {
  const { composer, listener, bump } = useSocial();
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
    <Box className={`py-2 gap-1 border-separator ${isReply ? 'ml-4 border-b-0' : 'border-b-hairline'}`}>
      {c.deleted ? (
        <Text className="text-muted">Comment deleted</Text>
      ) : (
        <>
          <Text className="font-semibold text-text">
            {c.displayName ?? 'Deleted account'}
            {c.offsetMs !== null ? <Text className="text-muted"> · {mmss(c.offsetMs)}</Text> : null}
          </Text>
          <Text className="text-[15px] text-text">{c.body}</Text>
          <Box className="flex-row gap-4">
            {!isReply ? (
              <Pressable onPress={() => (listener ? props.onReply(c.id) : router.push('/auth/sign-in'))} accessibilityRole="button" className={TAP}>
                <Text className="text-accent text-[14px]">Reply</Text>
              </Pressable>
            ) : null}
            {c.mine ? (
              <Pressable disabled={busy === c.id} onPress={() => remove(c.id)} accessibilityRole="button" className={TAP}>
                <Text className="text-accent text-[14px]">{busy === c.id ? 'Deleting…' : 'Delete'}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => setReporting({ kind: 'comment', id: c.id, authorId: c.authorId, label: 'comment' })} accessibilityRole="button" accessibilityLabel="Report this comment" className={TAP}>
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
    <>
      <Actionsheet isOpen onClose={props.onClose}>
        <ActionsheetBackdrop />
        <KeyboardAvoidingView className="w-full justify-end" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ActionsheetContent className="bg-surface px-4 pt-4 gap-2 rounded-t-row max-h-[70%] items-stretch">
            <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
            <Box className="flex-row justify-between items-center">
              <Text className="text-sm font-bold text-text">{props.title}</Text>
              <Pressable onPress={props.onClose} accessibilityRole="button" className={TAP}><Text className="text-accent text-[14px]">Close</Text></Pressable>
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

