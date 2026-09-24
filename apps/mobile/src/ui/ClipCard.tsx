/** One clip: caption, author (a profile link), range, and the actions the viewer may take. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import type { Clip } from '../social/api';
import { mmss } from './format';

export type ClipCardProps = {
  clip: Clip;
  pending?: boolean;
  onPlay?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
};

export function ClipCard(props: ClipCardProps): React.ReactElement {
  const { clip } = props;
  // M6 (FR-002/FR-013): a clip the viewer reported, or one moderation removed, keeps its place as a line of text.
  if (clip.reported || clip.removed) {
    return (
      <View style={styles.card}>
        <Text style={styles.muted}>{clip.reported ? 'You reported this' : 'Removed by moderation'}</Text>
      </View>
    );
  }
  return (
    <View style={styles.card} accessibilityLabel={`Clip ${mmss(clip.startMs)} to ${mmss(clip.endMs)}`}>
      <Pressable onPress={props.onPlay} disabled={!props.onPlay} accessibilityRole="button">
        <Text style={styles.range}>{mmss(clip.startMs)} – {mmss(clip.endMs)}{props.pending ? ' · sending…' : ''}{clip.deleted ? ' · removed' : ''}</Text>
        {clip.caption ? <Text style={styles.caption}>{clip.caption}</Text> : null}
      </Pressable>
      <View style={styles.row}>
        {clip.author.displayName !== null && !props.pending ? (
          <Link href={{ pathname: '/profile/[id]', params: { id: clip.author.id } }} asChild>
            <Pressable accessibilityRole="link"><Text style={styles.author}>by {clip.author.displayName}</Text></Pressable>
          </Link>
        ) : <Text style={styles.muted}>{props.pending ? 'by you' : 'by a deleted account'}</Text>}
        {props.onShare ? <Pressable onPress={props.onShare} accessibilityRole="button" accessibilityLabel="Share this clip"><Text style={styles.link}>Share</Text></Pressable> : null}
        {props.onDelete ? <Pressable onPress={props.onDelete} accessibilityRole="button" accessibilityLabel="Delete this clip"><Text style={[styles.link, styles.danger]}>Delete</Text></Pressable> : null}
        {props.onReport ? <Pressable onPress={props.onReport} accessibilityRole="button" accessibilityLabel="Report this clip"><Text style={styles.muted}>Report</Text></Pressable> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc', gap: 4 },
  range: { fontVariant: ['tabular-nums'], fontWeight: '600' },
  caption: { fontSize: 16 },
  row: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  author: { color: '#1a4fd6' },
  muted: { color: '#666' },
  link: { color: '#1a4fd6' },
  danger: { color: '#b00020' },
});
