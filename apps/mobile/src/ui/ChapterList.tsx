/** Chapters (US5, FR-021): start time + title, the current one highlighted, tap → seek. */
import { currentChapter, type Chapter } from '@socialmorning/player-core';
import { Linking } from 'react-native';
import { Image } from './lib/image';
import { Pressable } from './lib/pressable';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { mmss } from './format';
import { tabular } from '../design';

export function ChapterList(props: { chapters: Chapter[]; positionMs: number; onSeek: (ms: number) => void }): React.ReactElement {
  const current = currentChapter(props.chapters, props.positionMs);
  return (
    <Box className="w-full gap-0.5">
      {props.chapters.map((c, i) => (
        <Pressable key={`${c.startMs}-${i}`} onPress={() => props.onSeek(c.startMs)} accessibilityRole="button" accessibilityLabel={`Chapter ${i + 1}, ${c.title ?? mmss(c.startMs)}`} className={`flex-row items-center gap-2.5 py-1.5 px-1.5 rounded-md ${i === current ? 'bg-surface' : ''}`}>
          <Text className="text-text w-14" style={tabular}>{mmss(c.startMs)}</Text>
          <Text className={`flex-1 text-[15px] text-text ${i === current ? 'font-bold' : ''}`} numberOfLines={2}>{c.title ?? `Chapter ${i + 1}`}</Text>
          {c.url ? (
            <Pressable onPress={() => void Linking.openURL(c.url!)} accessibilityRole="link" hitSlop={8}><Text className="text-accent text-sm">↗</Text></Pressable>
          ) : null}
        </Pressable>
      ))}
    </Box>
  );
}

/** The current chapter's title (and artwork when it has one), for the player header. M17: Editorial meta type, muted. */
export function CurrentChapter(props: { chapters: Chapter[]; positionMs: number }): React.ReactElement | null {
  const i = currentChapter(props.chapters, props.positionMs);
  if (i === undefined) return null;
  const c = props.chapters[i]!;
  return (
    <Box className="flex-row items-center gap-2">
      {c.imageUrl ? <Image source={{ uri: c.imageUrl }} className="w-7 h-7 rounded-sm" /> : null}
      <Text className="text-muted text-meta font-semibold" numberOfLines={1}>{c.title ?? `Chapter ${i + 1}`}</Text>
    </Box>
  );
}

