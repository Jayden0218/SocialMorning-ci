/**
 * What a rail marker opens: the comment(s) at that second, with Delete on the
 * listener's own (FR-010) and Reply (one level, US2 #4). Replies-to-replies are
 * never offered: a reply row has no Reply button.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { mmss } from './format';
import { useSocial } from '../social/context';
import type { Comment } from '../social/api';

export function MomentSheet(props: {
  episodeId: string;
  title: string;
  comments: Comment[];
  onClose: () => void;
  onReply: (parentId: string) => void;
}): React.ReactElement {
  const { composer, listener, bump } = useSocial();
  const [busy, setBusy] = useState<string | undefined>();
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
    <View className={`py-2 gap-1 border-separator ${isReply ? 'ml-4 border-b-0' : 'border-b-hairline'}`}>
      {c.deleted ? (
        <Text className="text-muted">Comment deleted</Text>
      ) : (
        <>
          <Text className="font-semibold text-text">
            {c.displayName ?? 'Deleted account'}
            {c.offsetMs !== null ? <Text className="text-muted"> · {mmss(c.offsetMs)}</Text> : null}
          </Text>
          <Text className="text-[15px] text-text">{c.body}</Text>
          <View className="flex-row gap-4">
            {!isReply ? (
              <Pressable onPress={() => (listener ? props.onReply(c.id) : router.push('/auth/sign-in'))} accessibilityRole="button">
                <Text className="text-accent text-[14px]">Reply</Text>
              </Pressable>
            ) : null}
            {c.mine ? (
              <Pressable disabled={busy === c.id} onPress={() => remove(c.id)} accessibilityRole="button">
                <Text className="text-accent text-[14px]">{busy === c.id ? 'Deleting…' : 'Delete'}</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      )}
      {c.replies?.map((r) => <Row key={r.id} c={r} isReply />)}
    </View>
  );

  return (
    <Modal visible animationType="slide" transparent onRequestClose={props.onClose}>
      <KeyboardAvoidingView className="flex-1 justify-end bg-scrim" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View className="bg-surface p-4 gap-2 rounded-t-2xl max-h-[70%]">
          <View className="flex-row justify-between items-center">
            <Text className="text-sm font-bold text-text">{props.title}</Text>
            <Pressable onPress={props.onClose} accessibilityRole="button"><Text className="text-accent text-[14px]">Close</Text></Pressable>
          </View>
          <ScrollView className="grow-0">
            {props.comments.map((c) => <Row key={c.id} c={c} isReply={false} />)}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

