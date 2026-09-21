/**
 * The conversation (US4): top-level comments in "Newest" or "By moment" order,
 * replies one level under their parent, oldest first. Readable signed out; every
 * write control asks to sign in (FR-022, US4 #4). Tapping a moment chip plays
 * the episode from there.
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { orderComments, type CommentOrder } from '@socialmorning/social-core';
import { mmss, relativeTime } from './format';
import { useSocial } from '../social/context';
import type { Comment } from '../social/api';

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
  const [order, setOrder] = useState<CommentOrder>('newest');
  const [busy, setBusy] = useState<string | undefined>();

  const ordered = useMemo(
    () => orderComments(props.comments.map((c) => ({ ...c, createdAt: new Date(c.createdAt).getTime(), raw: c })), order),
    [props.comments, order],
  );

  const needSignIn = () => router.push('/auth/sign-in');

  async function remove(id: string) {
    setBusy(id);
    try { await composer.remove(props.episodeId, id); bump(props.episodeId); } finally { setBusy(undefined); }
  }

  const Row = ({ c, isReply }: { c: Comment; isReply: boolean }) => (
    <View style={[styles.row, isReply && styles.reply]}>
      {c.deleted ? (
        <Text style={styles.muted}>Comment deleted</Text>
      ) : (
        <>
          <View style={styles.head}>
            <Text style={styles.author}>{c.displayName ?? 'Deleted account'}</Text>
            {c.offsetMs !== null ? (
              <Pressable onPress={() => props.onSeek(c.offsetMs!)} accessibilityRole="button" accessibilityLabel={`Play from ${mmss(c.offsetMs)}`}>
                <Text style={styles.chip}>{mmss(c.offsetMs)}</Text>
              </Pressable>
            ) : null}
            <Text style={styles.muted}>{relativeTime(c.createdAt, props.serverTime)}</Text>
          </View>
          <Text style={styles.body}>{c.body}</Text>
          <View style={styles.actions}>
            {!isReply ? (
              <Pressable onPress={() => (listener ? props.onReply(c.id) : needSignIn())} accessibilityRole="button">
                <Text style={styles.link}>{listener ? 'Reply' : 'Sign in to reply'}</Text>
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
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Text style={styles.heading}>Comments</Text>
        <View style={styles.segment}>
          {(['newest', 'byMoment'] as const).map((o) => (
            <Pressable key={o} onPress={() => setOrder(o)} accessibilityRole="button" accessibilityState={{ selected: order === o }}>
              <Text style={[styles.segmentText, order === o && styles.segmentOn]}>{o === 'newest' ? 'Newest' : 'By moment'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {props.stale ? <Text style={styles.muted}>Couldn't refresh — showing the last copy</Text> : null}
      <Pressable style={styles.compose} onPress={() => (listener ? props.onCompose() : needSignIn())} accessibilityRole="button">
        <Text style={styles.link}>{listener ? 'Write a comment' : 'Sign in to join the conversation'}</Text>
      </Pressable>
      {ordered.length === 0 ? <Text style={styles.muted}>No comments yet.</Text> : null}
      {ordered.map((o) => <Row key={o.raw.id} c={o.raw} isReply={false} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: 12 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { fontSize: 17, fontWeight: '700' },
  segment: { flexDirection: 'row', gap: 12 },
  segmentText: { color: '#666', fontSize: 14 },
  segmentOn: { color: '#000', fontWeight: '700', textDecorationLine: 'underline' },
  compose: { paddingVertical: 6 },
  row: { paddingVertical: 8, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  reply: { marginLeft: 16, borderBottomWidth: 0 },
  head: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  author: { fontWeight: '600' },
  chip: { backgroundColor: '#eef', color: '#0645ad', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontSize: 12, fontWeight: '600' },
  body: { fontSize: 15 },
  muted: { color: '#666', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 16 },
  link: { color: '#0645ad', fontSize: 14 },
  danger: { color: '#b00020', fontSize: 14 },
});
