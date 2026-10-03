/** Transcript (US5, FR-022): timed → current line highlighted, tap → seek; untimed → text. */
import { currentLine, type Transcript } from '@socialmorning/player-core';
import { Pressable } from './lib/pressable';
import { ScrollView } from './lib/scroll-view';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { mmss } from './format';
import { tabular } from '../design';

const BOX = 'w-full max-h-[260px] border-hairline border-separator rounded-lg p-2';

export function TranscriptPane(props: { transcript: Transcript; positionMs: number; onSeek: (ms: number) => void }): React.ReactElement {
  if ('text' in props.transcript) {
    return (
      <ScrollView className={BOX} nestedScrollEnabled>
        <Text className="text-[14px] leading-[20px] text-text">{props.transcript.text}</Text>
      </ScrollView>
    );
  }
  const lines = props.transcript.lines;
  const current = currentLine(lines, props.positionMs);
  return (
    <ScrollView className={BOX} nestedScrollEnabled>
      <Box className="gap-1">
        {lines.map((l, i) => (
          <Pressable key={`${l.startMs}-${i}`} onPress={() => props.onSeek(l.startMs)} accessibilityRole="button" className={`flex-row gap-2 py-[3px] px-1 rounded-sm ${i === current ? 'bg-surface' : ''}`}>
            <Text className="text-muted w-[52px] text-xs pt-0.5" style={tabular}>{mmss(l.startMs)}</Text>
            <Text className={`text-[14px] leading-[20px] text-text flex-1 ${i === current ? 'font-semibold' : ''}`}>
              {l.speaker ? <Text className="text-muted font-semibold">{l.speaker}: </Text> : null}{l.text}
            </Text>
          </Pressable>
        ))}
      </Box>
    </ScrollView>
  );
}

