// Episode transcript; current line is marked; tap a line to jump; long-press to pick lines to share.
/**
 * Transcript (US5, FR-022): timed → current line highlighted, tap → seek; untimed → text.
 *
 * M20 US1 (FR-001): with `onShareImage`, a long-press on a line starts picking — tap adds or
 * removes lines (no seeking while picking), and a bar offers "Share as image" and Cancel.
 * Plain-text transcripts are picked by paragraph and link to the episode's start. Over 280
 * characters the bar says so instead of offering the card.
 */
import { useState } from 'react';
import { currentLine, type Transcript } from '@socialmorning/player-core';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { mmss } from '@/ui/kit/format';
import { hit, tabular } from '@/design';
import { pickableLines, QUOTE_CARD_MAX, quoteOf, toggleLine, type Quote } from '@/graph/quote';

const BOX = 'w-full max-h-[260px] border-hairline border-separator rounded-lg p-2';
const TAP = { minHeight: hit.min };

export function TranscriptPane(props: {
  transcript: Transcript;
  positionMs: number;
  onSeek: (ms: number) => void;
  /** M20 US1: share picked lines as the quote card. Absent = no picking. */
  onShareImage?: (q: Quote) => void;
  durationMs?: number;
}): React.ReactElement {
  const [picked, setPicked] = useState<number[] | undefined>(undefined);
  const { lines, timed } = pickableLines(props.transcript);
  const picking = picked !== undefined;
  const quote = picking ? quoteOf(lines, picked, timed, props.durationMs) : undefined;
  const start = (i: number) => { if (props.onShareImage) setPicked([i]); };

  if (!timed && !props.onShareImage) {
    return (
      <ScrollView className={BOX} nestedScrollEnabled>
        <Text className="text-[14px] leading-[20px] text-text">{'text' in props.transcript ? props.transcript.text : ''}</Text>
      </ScrollView>
    );
  }
  const current = timed ? currentLine(lines, props.positionMs) : undefined;
  return (
    <Box className="w-full gap-2">
      <ScrollView className={BOX} nestedScrollEnabled>
        <Box className="gap-1">
          {lines.map((l, i) => {
            const on = picked?.includes(i) === true;
            return (
              <Pressable key={`${l.startMs}-${i}`} testID={`transcript-line-${i}`}
                onPress={() => { if (picking) setPicked(toggleLine(picked, i)); else if (timed) props.onSeek(l.startMs); }}
                onLongPress={picking ? undefined : () => start(i)}
                accessibilityRole="button"
                accessibilityState={picking ? { selected: on } : undefined}
                accessibilityHint={picking ? 'Adds or removes this line' : props.onShareImage ? 'Long-press to pick lines to share' : undefined}
                className={`flex-row gap-2 py-[3px] px-1 rounded-sm ${on ? 'bg-accentTint' : i === current ? 'bg-surface' : ''}`}>
                {timed ? <Text className="text-muted w-[52px] text-xs pt-0.5" style={tabular}>{mmss(l.startMs)}</Text> : null}
                <Text className={`text-[14px] leading-[20px] text-text flex-1 ${i === current || on ? 'font-semibold' : ''}`}>
                  {l.speaker ? <Text className="text-muted font-semibold">{l.speaker}: </Text> : null}{l.text}
                </Text>
              </Pressable>
            );
          })}
        </Box>
      </ScrollView>
      {picking ? (
        <Box className="flex-row items-center gap-2">
          <Text className="flex-1 text-xs text-muted">
            {quote === undefined ? 'Tap lines to pick them' : quote.tooLong ? `Too long for a picture — up to ${QUOTE_CARD_MAX} characters` : `${quote.text.length} of ${QUOTE_CARD_MAX} characters`}
          </Text>
          <Pressable onPress={() => setPicked(undefined)} accessibilityRole="button" accessibilityLabel="Cancel picking lines" className="px-section justify-center rounded-pill border border-border" style={TAP}>
            <Text className="text-sm font-semibold text-text">Cancel</Text>
          </Pressable>
          <Pressable disabled={quote === undefined || quote.tooLong}
            onPress={() => { if (quote && !quote.tooLong) { props.onShareImage?.(quote); setPicked(undefined); } }}
            accessibilityRole="button" accessibilityLabel="Share the picked lines as an image"
            accessibilityState={{ disabled: quote === undefined || quote.tooLong }}
            className={`px-section justify-center rounded-pill bg-primary ${quote === undefined || quote.tooLong ? 'opacity-50' : ''}`} style={TAP}>
            <Text className="text-sm font-bold text-onPrimary">Share as image</Text>
          </Pressable>
        </Box>
      ) : null}
    </Box>
  );
}
