/** Chapters (US5, FR-021): start time + title, the current one highlighted, tap → seek. */
import { currentChapter, type Chapter } from '@socialmorning/player-core';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { mmss } from './format';
import { colour } from '../design';

export function ChapterList(props: { chapters: Chapter[]; positionMs: number; onSeek: (ms: number) => void }): React.ReactElement {
  const current = currentChapter(props.chapters, props.positionMs);
  return (
    <View style={styles.wrap}>
      {props.chapters.map((c, i) => (
        <Pressable key={`${c.startMs}-${i}`} onPress={() => props.onSeek(c.startMs)} accessibilityRole="button" accessibilityLabel={`Chapter ${i + 1}, ${c.title ?? mmss(c.startMs)}`} style={[styles.row, i === current && styles.current]}>
          <Text style={styles.time}>{mmss(c.startMs)}</Text>
          <Text style={[styles.title, i === current && styles.titleCurrent]} numberOfLines={2}>{c.title ?? `Chapter ${i + 1}`}</Text>
          {c.url ? (
            <Pressable onPress={() => void Linking.openURL(c.url!)} accessibilityRole="link" hitSlop={8}><Text style={styles.link}>↗</Text></Pressable>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

/** The current chapter's title (and artwork when it has one), for the player header. */
export function CurrentChapter(props: { chapters: Chapter[]; positionMs: number }): React.ReactElement | null {
  const i = currentChapter(props.chapters, props.positionMs);
  if (i === undefined) return null;
  const c = props.chapters[i]!;
  return (
    <View style={styles.now}>
      {c.imageUrl ? <Image source={{ uri: c.imageUrl }} style={styles.art} /> : null}
      <Text style={styles.nowText} numberOfLines={1}>{c.title ?? `Chapter ${i + 1}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 6 },
  current: { backgroundColor: colour.surface },
  time: { fontVariant: ['tabular-nums'], color: colour.text, width: 56 },
  title: { flex: 1, fontSize: 15 },
  titleCurrent: { fontWeight: '700' },
  link: { color: colour.accent, fontSize: 16 },
  now: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  art: { width: 28, height: 28, borderRadius: 4 },
  nowText: { color: colour.text, fontSize: 13 },
});
