/**
 * What a rail marker opens: the comment(s) at that second, with Delete on the
 * listener's own (FR-010) and Reply (one level, US2 #4). Replies-to-replies are
 * never offered: a reply row has no Reply button.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
    <View style={[styles.row, isReply && styles.reply]}>
      {c.deleted ? (
        <Text style={styles.muted}>Comment deleted</Text>
      ) : (
        <>
          <Text style={styles.author}>
            {c.displayName ?? 'Deleted account'}
            {c.offsetMs !== null ? <Text style={styles.muted}> · {mmss(c.offsetMs)}</Text> : null}
          </Text>
          <Text style={styles.body}>{c.body}</Text>
          <View style={styles.actions}>
            {!isReply ? (
              <Pressable onPress={() => (listener ? props.onReply(c.id) : router.push('/auth/sign-in'))} accessibilityRole="button">
                <Text style={styles.link}>Reply</Text>
              </Pressable>
            ) : null}
            {c.mine ? (
              <Pressable disabled={busy === c.id} onPress={() => remove(c.id)} accessibilityRole="button">
                <Text style={styles.danger}>{busy === c.id ? 'Deleting…' : 'Delete'}</Text>
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
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>{props.title}</Text>
            <Pressable onPress={props.onClose} accessibilityRole="button"><Text style={styles.link}>Close</Text></Pressable>
          </View>
          <ScrollView style={styles.list}>
            {props.comments.map((c) => <Row key={c.id} c={c} isReply={false} />)}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#fff', padding: 16, gap: 8, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700' },
  list: { flexGrow: 0 },
  row: { paddingVertical: 8, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  reply: { marginLeft: 16, borderBottomWidth: 0 },
  author: { fontWeight: '600' },
  body: { fontSize: 15 },
  muted: { color: '#666' },
  actions: { flexDirection: 'row', gap: 16 },
  link: { color: '#0645ad', fontSize: 14 },
  danger: { color: '#b00020', fontSize: 14 },
});
