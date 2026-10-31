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
 *
 * M31 T024 (design-pulse2 `player--transcript-pane`, "Layout: Thread"): each line hangs from a time
 * spine (2 wide, hot → violet → line) with its timestamp chip; the live line is a solid hot chip and
 * 18/26 semibold text, the others 16/24 in text3; "Back to now" is a light pill (40). Same names,
 * handlers and picking as before; the pills of the menus and bars are the kit's quiet / light / hot.
 *
 * M22 US9 (FR-028, FR-029): with `selectable` (the full transcript page only) a long-press starts
 * a selection and taps move its nearer end, so it is always one unbroken run of lines
 * (`extendRange`, src/graph/transcript-select). The bar offers Clip (`onClip`; disabled with the
 * reason when the run is over the clip limit or has no times), Copy (`onCopy`), Share as image,
 * and — with one line picked — Report a mistake.
 */
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { currentLine, type Transcript, type TranscriptLine } from '@socialmorning/player-core';
import { plural } from '@socialmorning/social-core';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { LinearGradient } from '@/design/tailwind';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { mmss } from '@/ui/kit/format';
import { colour, hit } from '@/design';
import { pickableLines, QUOTE_CARD_MAX, quoteOf, toggleLine, type Quote } from '@/graph/quote';
import { clipCheck, extendRange, rangeLines, type LineRange } from '@/graph/transcript-select';
import { drawnType } from '@/design/type-px';

const BOX = 'w-full max-h-[260px]';
const BOX_FILL = 'w-full flex-1';
const TAP = { minHeight: hit.min };
/** The spine runs down the middle of the chips' column (46 wide). */
const SPINE = { left: 22, width: 2, top: 0, bottom: 0 };
const SPINE_COLOURS = [colour.hot, colour.violet, colour.line] as const;
/** The quiet pill the menus and bars use. */
const QUIET = 'px-section justify-center rounded-pill bg-raise';

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
  /** M22 US9: contiguous selection with Clip / Copy / Share as image (the full transcript page). */
  selectable?: boolean;
  onClip?: (q: Quote) => void;
  onCopy?: (text: string) => void;
}): React.ReactElement {
  const [picked, setPicked] = useState<number[] | undefined>(undefined);
  const [run, setRun] = useState<LineRange | undefined>(undefined);
  const [menu, setMenu] = useState<number | undefined>(undefined);
  const [away, setAway] = useState(false);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef<number[]>([]);
  const { lines, timed } = pickableLines(props.transcript);
  const selecting = props.selectable === true && run !== undefined;
  const picking = picked !== undefined || selecting;
  const chosen = selecting ? rangeLines(run) : picked;
  const quote = chosen !== undefined ? quoteOf(lines, chosen, timed, props.durationMs) : undefined;
  const current = timed ? currentLine(lines, props.positionMs) : undefined;
  const box = props.fill ? BOX_FILL : BOX;
  const longPress = (i: number) => {
    if (props.selectable) setRun([i, i]);
    else if (props.onReport && timed) setMenu(i);
    else if (props.onShareImage) setPicked([i]);
  };
  const followNow = (animated: boolean) => {
    const y = current === undefined ? undefined : offsets.current[current];
    if (y !== undefined) scroller.current?.scrollTo?.({ y: Math.max(0, y - 40), animated });
  };
  // Follow the audio while the listener has not scrolled away.
  useEffect(() => { if (!away && !picking) followNow(true); }, [current, away]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!timed && !props.onShareImage && !props.onReport && !props.selectable) {
    return (
      <ScrollView className={box} nestedScrollEnabled>
        <Type step="body" className="text-text2">{'text' in props.transcript ? props.transcript.text : ''}</Type>
      </ScrollView>
    );
  }
  return (
    <Box className={props.fill ? 'w-full flex-1 gap-gap' : 'w-full gap-gap'}>
      <ScrollView ref={scroller} className={box} nestedScrollEnabled onScrollBeginDrag={() => { if (timed) setAway(true); }}>
        <Box className="gap-row">
          {/* The spine: one line behind all the chips. */}
          {timed ? <LinearGradient colors={SPINE_COLOURS} className="absolute" style={SPINE} pointerEvents="none" accessible={false} /> : null}
          {lines.map((l, i) => {
            const on = chosen?.includes(i) === true;
            const live = i === current;
            return (
              <Pressable key={`${l.startMs}-${i}`} testID={`transcript-line-${i}`}
                onLayout={(e) => { offsets.current[i] = e.nativeEvent.layout.y; }}
                onPress={() => { if (selecting) setRun(extendRange(run, i)); else if (picked !== undefined) setPicked(toggleLine(picked, i)); else if (timed) props.onSeek(l.startMs); }}
                onLongPress={picking ? undefined : () => longPress(i)}
                accessibilityRole="button"
                accessibilityState={picking ? { selected: on } : undefined}
                accessibilityHint={selecting ? 'Extends or shrinks the selected lines to here' : picking ? 'Adds or removes this line' : props.selectable ? 'Long-press to select lines' : props.onReport && timed ? 'Long-press to share or report this line' : props.onShareImage ? 'Long-press to pick lines to share' : undefined}
                className={`flex-row items-start gap-row rounded-small ${on || menu === i ? 'bg-hotSoft' : ''}`} style={{ minHeight: 24 }}>
                {timed ? <Box className="items-start" style={{ width: 46 }}><TimestampChip text={mmss(l.startMs)} solid={live || on} /></Box> : null}
                <Type step="body" className={`flex-1 ${live || on ? 'text-text font-semibold' : 'text-text3'}`} style={live || on ? drawnType.transcriptLive : drawnType.transcript}>
                  {l.speaker ? <Type step="body" className="text-text2 font-semibold">{l.speaker}: </Type> : null}{l.text}
                </Type>
              </Pressable>
            );
          })}
        </Box>
      </ScrollView>
      {away && !picking && current !== undefined ? (
        <Pressable onPress={() => { setAway(false); followNow(true); }} accessibilityRole="button" accessibilityLabel="Back to now" className="self-start flex-row items-center gap-hair px-section rounded-pill bg-text justify-center" style={{ height: 40 }}>
          <Type step="row" className="text-void">Back to now</Type>
        </Pressable>
      ) : null}
      {menu !== undefined && !picking ? (
        <Box className="flex-row items-center gap-gap flex-wrap">
          <Type step="caption" className="flex-1 text-text3" numberOfLines={1}>{timed ? `Line at ${mmss(lines[menu]?.startMs ?? 0)}` : 'This paragraph'}</Type>
          <Pressable onPress={() => setMenu(undefined)} accessibilityRole="button" accessibilityLabel="Cancel" className="px-section justify-center rounded-pill bg-raise" style={TAP}>
            <Type step="row" className="text-text">Cancel</Type>
          </Pressable>
          {props.onShareImage ? (
            <Pressable onPress={() => { setPicked([menu]); setMenu(undefined); }} accessibilityRole="button" accessibilityLabel="Share lines" className="px-section justify-center rounded-pill bg-raise" style={TAP}>
              <Type step="row" className="text-text">Share lines</Type>
            </Pressable>
          ) : null}
          <Pressable onPress={() => { const l = lines[menu]; setMenu(undefined); if (l) props.onReport?.(l); }} accessibilityRole="button" accessibilityLabel="Report a mistake" className="px-section justify-center rounded-pill bg-hot" style={TAP}>
            <Type step="row" className="text-void">Report a mistake</Type>
          </Pressable>
        </Box>
      ) : null}
      {selecting ? (
        <SelectBar
          quote={quote}
          count={chosen?.length ?? 0}
          onCancel={() => setRun(undefined)}
          {...(props.onClip ? { onClip: (q: Quote) => { props.onClip?.(q); setRun(undefined); } } : {})}
          {...(props.onCopy ? { onCopy: (t: string) => { props.onCopy?.(t); setRun(undefined); } } : {})}
          {...(props.onShareImage ? { onShareImage: (q: Quote) => { props.onShareImage?.(q); setRun(undefined); } } : {})}
          {...(props.onReport && timed && run && run[0] === run[1] ? { onReport: () => { const l = lines[run[0]]; setRun(undefined); if (l) props.onReport?.(l); } } : {})}
        />
      ) : null}
      {picking && !selecting ? (
        <Box className="flex-row items-center gap-gap">
          <Type step="caption" className="flex-1 text-text3">
            {quote === undefined ? 'Tap lines to pick them' : quote.tooLong ? `Too long for a picture — up to ${QUOTE_CARD_MAX} characters` : props.onShareVideo && timed && !quote.video ? 'Videos are 60 s or less' : `${quote.text.length} of ${QUOTE_CARD_MAX} characters`}
          </Type>
          <Pressable onPress={() => setPicked(undefined)} accessibilityRole="button" accessibilityLabel="Cancel picking lines" className="px-section justify-center rounded-pill bg-raise" style={TAP}>
            <Type step="row" className="text-text">Cancel</Type>
          </Pressable>
          {props.onShareVideo && timed ? (
            <Pressable disabled={quote === undefined || !quote.video}
              onPress={() => { if (quote?.video) { props.onShareVideo?.(quote); setPicked(undefined); } }}
              accessibilityRole="button" accessibilityLabel="Share the picked lines as a video"
              accessibilityState={{ disabled: quote === undefined || !quote.video }}
              className={`px-section justify-center rounded-pill bg-raise ${quote === undefined || !quote.video ? 'opacity-50' : ''}`} style={TAP}>
              <Type step="row" className="text-text">Video</Type>
            </Pressable>
          ) : null}
          <Pressable disabled={quote === undefined || quote.tooLong}
            onPress={() => { if (quote && !quote.tooLong) { props.onShareImage?.(quote); setPicked(undefined); } }}
            accessibilityRole="button" accessibilityLabel="Share the picked lines as an image"
            accessibilityState={{ disabled: quote === undefined || quote.tooLong }}
            className={`px-section justify-center rounded-pill bg-hot ${quote === undefined || quote.tooLong ? 'opacity-50' : ''}`} style={TAP}>
            <Type step="row" className="text-void">Share as image</Type>
          </Pressable>
        </Box>
      ) : null}
    </Box>
  );
}

/** M22 US9: the bar under a contiguous selection — Clip, Copy, Share as image, Cancel (and Report for one line). */
function SelectBar(props: {
  quote: Quote | undefined;
  count: number;
  onCancel: () => void;
  onClip?: (q: Quote) => void;
  onCopy?: (text: string) => void;
  onShareImage?: (q: Quote) => void;
  onReport?: () => void;
}): React.ReactElement {
  const q = props.quote;
  const clip = clipCheck(q);
  const imageOk = q !== undefined && !q.tooLong;
  const note = props.onClip && !clip.ok ? clip.reason
    : q?.tooLong ? `Too long for a picture — up to ${QUOTE_CARD_MAX} characters`
    : `${plural(props.count, 'line')} selected`;
  const chip = (on: boolean) => `${QUIET} ${on ? '' : 'opacity-50'}`;
  return (
    <Box className="gap-gap">
      <Type step="caption" className="text-text3" accessibilityLiveRegion="polite">{note}</Type>
      <Box className="flex-row items-center gap-gap flex-wrap">
        <Pressable onPress={props.onCancel} accessibilityRole="button" accessibilityLabel="Cancel selecting lines" className={chip(true)} style={TAP}>
          <Type step="row" className="text-text">Cancel</Type>
        </Pressable>
        {props.onCopy ? (
          <Pressable disabled={q === undefined} onPress={() => { if (q) props.onCopy?.(q.text); }} accessibilityRole="button" accessibilityLabel="Copy the selected lines" accessibilityState={{ disabled: q === undefined }} className={chip(q !== undefined)} style={TAP}>
            <Type step="row" className="text-text">Copy</Type>
          </Pressable>
        ) : null}
        {props.onShareImage ? (
          <Pressable disabled={!imageOk} onPress={() => { if (q && imageOk) props.onShareImage?.(q); }} accessibilityRole="button" accessibilityLabel="Share the selected lines as an image" accessibilityState={{ disabled: !imageOk }} className={chip(imageOk)} style={TAP}>
            <Type step="row" className="text-text">Share as image</Type>
          </Pressable>
        ) : null}
        {props.onReport ? (
          <Pressable onPress={props.onReport} accessibilityRole="button" accessibilityLabel="Report a mistake" className={chip(true)} style={TAP}>
            <Type step="row" className="text-text">Report</Type>
          </Pressable>
        ) : null}
        {props.onClip ? (
          <Pressable disabled={!clip.ok} onPress={() => { if (q && clip.ok) props.onClip?.(q); }} accessibilityRole="button" accessibilityLabel="Clip the selected lines" accessibilityHint={clip.ok ? undefined : clip.reason} accessibilityState={{ disabled: !clip.ok }} className={`px-section justify-center rounded-pill bg-hot ${clip.ok ? '' : 'opacity-50'}`} style={TAP}>
            <Type step="row" className="text-void">Clip</Type>
          </Pressable>
        ) : null}
      </Box>
    </Box>
  );
}
