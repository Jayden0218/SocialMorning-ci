// Episode transcript: follows the audio, tap a line to jump, long-press to share lines or report a mistake.
/**
 * Transcript (US5, FR-022): timed → current line highlighted, tap → seek; untimed → text.
 *
 * M20 US1 (FR-001): with `onShareImage`, a long-press on a line starts picking — tap adds or
 * removes lines (no seeking while picking), and a bar offers "Share as image" and Cancel.
 * Plain-text transcripts are picked by paragraph and link to the episode's start. Over 280
 * characters the bar says so instead of offering the card.
 *
 * M20 W2 (FR-002): with `onShareVideo`, "Video" makes a short video of the picked range with the
 * lines as captions — only for a timed transcript and 60 s or less; otherwise it is shown disabled
 * and the bar says why ("Videos are 60 s or less").
 *
 * M21 US2 (spec story 2, scenarios 5–6), after 小宇宙's player:
 *   - `TranscriptPeek` (./TranscriptExtras): the player shows the line now and the next one; a tap
 *     expands this list in place, ⤢ opens the full-screen page (app/transcript/[episodeId].tsx).
 *   - The list follows the audio; once the listener scrolls it, it stops following and
 *     "Back to now" appears, which scrolls back and follows again.
 *   - With `onReport`, a long-press opens a small menu on that line: "Share lines" (the M20
 *     picking, when sharing is offered) and "Report a mistake" → `TranscriptReportSheet` (./TranscriptExtras), where
 *     the listener types the right words; it reaches the show's host in the Studio.
 *     Without `onReport` a long-press starts picking at once, as before.
 */
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { currentLine, type Transcript, type TranscriptLine } from '@socialmorning/player-core';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { mmss } from '@/ui/kit/format';
import { hit, tabular } from '@/design';
import { pickableLines, QUOTE_CARD_MAX, quoteOf, toggleLine, type Quote } from '@/graph/quote';

const BOX = 'w-full max-h-[260px] border-hairline border-separator rounded-lg p-2';
const BOX_FILL = 'w-full flex-1';
const TAP = { minHeight: hit.min };

/** The line playing now and the one after it; `undefined` before the first line. */
export function nowAndNext(lines: readonly TranscriptLine[], positionMs: number): { now?: TranscriptLine; next?: TranscriptLine } {
  const i = currentLine(lines, positionMs);
  if (i === undefined) return lines[0] ? { next: lines[0] } : {};
  return { now: lines[i], ...(lines[i + 1] ? { next: lines[i + 1] } : {}) };
}

export function TranscriptPane(props: {
  transcript: Transcript;
  positionMs: number;
  onSeek: (ms: number) => void;
  /** M20 US1: share picked lines as the quote card. Absent = no picking. */
  onShareImage?: (q: Quote) => void;
  /** M20 US1 (FR-002): share picked lines (≤ 60 s, timed) as a video with them as captions. Absent = no video button. */
  onShareVideo?: (q: Quote) => void;
  /** M21 US2: "Report a mistake" on a line (long-press menu). Absent = no menu. */
  onReport?: (line: TranscriptLine) => void;
  /** M21 US2: fill the page (the full-screen transcript) instead of a 260 pt box. */
  fill?: boolean;
  durationMs?: number;
}): React.ReactElement {
  const [picked, setPicked] = useState<number[] | undefined>(undefined);
  const [menu, setMenu] = useState<number | undefined>(undefined);
  const [away, setAway] = useState(false);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef<number[]>([]);
  const { lines, timed } = pickableLines(props.transcript);
  const picking = picked !== undefined;
  const quote = picking ? quoteOf(lines, picked, timed, props.durationMs) : undefined;
  const current = timed ? currentLine(lines, props.positionMs) : undefined;
  const box = props.fill ? BOX_FILL : BOX;
  const longPress = (i: number) => {
    if (props.onReport && timed) setMenu(i);
    else if (props.onShareImage) setPicked([i]);
  };
  const followNow = (animated: boolean) => {
    const y = current === undefined ? undefined : offsets.current[current];
    if (y !== undefined) scroller.current?.scrollTo?.({ y: Math.max(0, y - 40), animated });
  };
  // Follow the audio while the listener has not scrolled away.
  useEffect(() => { if (!away && !picking) followNow(true); }, [current, away]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!timed && !props.onShareImage && !props.onReport) {
    return (
      <ScrollView className={box} nestedScrollEnabled>
        <Text className="text-[14px] leading-[20px] text-text">{'text' in props.transcript ? props.transcript.text : ''}</Text>
      </ScrollView>
    );
  }
  return (
    <Box className={props.fill ? 'w-full flex-1 gap-2' : 'w-full gap-2'}>
      <ScrollView ref={scroller} className={box} nestedScrollEnabled onScrollBeginDrag={() => { if (timed) setAway(true); }}>
        <Box className="gap-1">
          {lines.map((l, i) => {
            const on = picked?.includes(i) === true;
            return (
              <Pressable key={`${l.startMs}-${i}`} testID={`transcript-line-${i}`}
                onLayout={(e) => { offsets.current[i] = e.nativeEvent.layout.y; }}
                onPress={() => { if (picking) setPicked(toggleLine(picked, i)); else if (timed) props.onSeek(l.startMs); }}
                onLongPress={picking ? undefined : () => longPress(i)}
                accessibilityRole="button"
                accessibilityState={picking ? { selected: on } : undefined}
                accessibilityHint={picking ? 'Adds or removes this line' : props.onReport && timed ? 'Long-press to share or report this line' : props.onShareImage ? 'Long-press to pick lines to share' : undefined}
                className={`flex-row gap-2 py-[3px] px-1 rounded-sm ${on || menu === i ? 'bg-accentTint' : i === current ? 'bg-surface' : ''}`}>
                {timed ? <Text className="text-muted w-[52px] text-xs pt-0.5" style={tabular}>{mmss(l.startMs)}</Text> : null}
                <Text className={`text-[14px] leading-[20px] text-text flex-1 ${i === current || on ? 'font-semibold' : ''}`}>
                  {l.speaker ? <Text className="text-muted font-semibold">{l.speaker}: </Text> : null}{l.text}
                </Text>
              </Pressable>
            );
          })}
        </Box>
      </ScrollView>
      {away && !picking && current !== undefined ? (
        <Pressable onPress={() => { setAway(false); followNow(true); }} accessibilityRole="button" accessibilityLabel="Back to now" className="self-center flex-row items-center gap-1 px-section rounded-pill bg-primary justify-center" style={TAP}>
          <Text className="text-sm font-bold text-onPrimary">Back to now</Text>
        </Pressable>
      ) : null}
      {menu !== undefined && !picking ? (
        <Box className="flex-row items-center gap-2 flex-wrap">
          <Text className="flex-1 text-xs text-muted" numberOfLines={1}>{timed ? `Line at ${mmss(lines[menu]?.startMs ?? 0)}` : 'This paragraph'}</Text>
          <Pressable onPress={() => setMenu(undefined)} accessibilityRole="button" accessibilityLabel="Cancel" className="px-section justify-center rounded-pill border border-border" style={TAP}>
            <Text className="text-sm font-semibold text-text">Cancel</Text>
          </Pressable>
          {props.onShareImage ? (
            <Pressable onPress={() => { setPicked([menu]); setMenu(undefined); }} accessibilityRole="button" accessibilityLabel="Share lines" className="px-section justify-center rounded-pill border border-border" style={TAP}>
              <Text className="text-sm font-semibold text-text">Share lines</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => { const l = lines[menu]; setMenu(undefined); if (l) props.onReport?.(l); }} accessibilityRole="button" accessibilityLabel="Report a mistake" className="px-section justify-center rounded-pill bg-primary" style={TAP}>
            <Text className="text-sm font-bold text-onPrimary">Report a mistake</Text>
          </Pressable>
        </Box>
      ) : null}
      {picking ? (
        <Box className="flex-row items-center gap-2">
          <Text className="flex-1 text-xs text-muted">
            {quote === undefined ? 'Tap lines to pick them' : quote.tooLong ? `Too long for a picture — up to ${QUOTE_CARD_MAX} characters` : props.onShareVideo && timed && !quote.video ? 'Videos are 60 s or less' : `${quote.text.length} of ${QUOTE_CARD_MAX} characters`}
          </Text>
          <Pressable onPress={() => setPicked(undefined)} accessibilityRole="button" accessibilityLabel="Cancel picking lines" className="px-section justify-center rounded-pill border border-border" style={TAP}>
            <Text className="text-sm font-semibold text-text">Cancel</Text>
          </Pressable>
          {props.onShareVideo && timed ? (
            <Pressable disabled={quote === undefined || !quote.video}
              onPress={() => { if (quote?.video) { props.onShareVideo?.(quote); setPicked(undefined); } }}
              accessibilityRole="button" accessibilityLabel="Share the picked lines as a video"
              accessibilityState={{ disabled: quote === undefined || !quote.video }}
              className={`px-section justify-center rounded-pill border border-border ${quote === undefined || !quote.video ? 'opacity-50' : ''}`} style={TAP}>
              <Text className="text-sm font-semibold text-text">Video</Text>
            </Pressable>
          ) : null}
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
