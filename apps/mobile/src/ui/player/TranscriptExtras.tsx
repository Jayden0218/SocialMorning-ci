// The player's two transcript lines (now and next) with ⤢, and the sheet to report a wrong line.
/**
 * M21 US2 (spec story 2, scenarios 5–6). Kept apart from `TranscriptPane` so the pane stays a
 * plain component with no app context (its tests render it bare).
 */
import { BusyContent } from '@/ui/kit/BusyContent';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import type { Transcript, TranscriptLine } from '@socialmorning/player-core';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { mmss } from '@/ui/kit/format';
import { Icon } from '@/ui/kit/Icon';
import { useColours } from '@/ui/kit/useColours';
import { hit, tabular } from '@/design';
import { pickableLines } from '@/graph/quote';
import { useSocial } from '@/social/context';
import { announce } from '@/safety/context';
import { nowAndNext } from '@/ui/player/TranscriptPane';

const TAP = { minHeight: hit.min };
/** What the server keeps of a line and of the correction (contracts/api.md). */
export const TRANSCRIPT_TEXT_MAX = 500;

/**
 * M21 US2: the player's two transcript lines — now (a serif quote) and next (muted). A tap
 * expands the full list in place; ⤢ opens the full-screen page.
 */
export function TranscriptPeek(props: {
  transcript: Transcript;
  positionMs: number;
  episodeId: string;
  expanded: boolean;
  onToggle: () => void;
}): React.ReactElement | null {
  const c = useColours();
  const { lines, timed } = pickableLines(props.transcript);
  if (!timed || lines.length === 0) return null;
  const { now, next } = nowAndNext(lines, props.positionMs);
  return (
    <Box className="flex-row items-start gap-2">
      <Pressable onPress={props.onToggle} accessibilityRole="button" accessibilityLabel={props.expanded ? 'Show two lines of the transcript' : 'Show the whole transcript here'} accessibilityHint={now?.text ?? next?.text} accessibilityState={{ expanded: props.expanded }} className="flex-1 gap-1" style={TAP}>
        {now ? (
          <Text className="text-hero font-display-semibold text-text" numberOfLines={3}>
            <Text className="text-hero font-display-semibold text-accent">“</Text>{now.text}<Text className="text-hero font-display-semibold text-accent">”</Text>
          </Text>
        ) : null}
        {next ? <Text className="text-body text-muted" numberOfLines={2}>{next.text}</Text> : null}
      </Pressable>
      <Pressable onPress={() => router.push({ pathname: '/transcript/[episodeId]', params: { episodeId: props.episodeId } })} accessibilityRole="button" accessibilityLabel="Open the transcript full screen" className="items-center justify-center" style={{ minWidth: hit.min, minHeight: hit.min }}>
        <Icon name="expand-outline" size={22} color={c.text} />
      </Pressable>
    </Box>
  );
}

/**
 * M21 US2 (scenario 6): "Report a mistake" — the line as it is, a box for the right words, Send.
 * Signed out → the sign-in page. The report goes to POST /v1/reports (targetKind 'transcript').
 */
export function TranscriptReportSheet(props: { episodeId: string; line: TranscriptLine | undefined; onClose: () => void }): React.ReactElement {
  const c = useColours();
  const { api, listener } = useSocial();
  const [words, setWords] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'failed'>('idle');
  const open = props.line !== undefined;
  useEffect(() => { setWords(props.line?.text.slice(0, TRANSCRIPT_TEXT_MAX) ?? ''); setState('idle'); }, [props.line]);
  const changed = words.trim().length > 0 && words.trim() !== props.line?.text.trim();
  const send = async () => {
    const line = props.line;
    if (!line || !changed) return;
    if (!listener) { props.onClose(); router.push('/auth/sign-in'); return; }
    setState('sending');
    try {
      await api.reportTranscript({ episodeId: props.episodeId, offsetMs: Math.round(line.startMs), original: line.text.slice(0, TRANSCRIPT_TEXT_MAX), suggested: words.trim().slice(0, TRANSCRIPT_TEXT_MAX) });
      announce('Sent to the show. Thank you.');
      props.onClose();
    } catch {
      setState('failed');
    }
  };
  return (
    <Actionsheet isOpen={open} onClose={props.onClose}>
      <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
      <ActionsheetContent className="bg-surface rounded-t-row px-screen-x pt-row items-stretch" accessibilityViewIsModal>
        <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
        <Text className="text-display font-display text-text" accessibilityRole="header">Report a mistake</Text>
        <Text className="text-body text-muted mt-1">The show's host sees the line and your words in their Studio.</Text>
        {props.line ? <Text className="text-xs text-muted mt-section" style={tabular}>{`At ${mmss(props.line.startMs)} it says:`}</Text> : null}
        {props.line ? <Text className="text-body text-text mt-1" numberOfLines={4}>{props.line.text}</Text> : null}
        <Text className="text-meta font-bold text-text mt-section mb-1.5">It should say</Text>
        <Textarea className="bg-surface border border-border rounded-row min-h-16 h-auto">
          <TextareaInput placeholderTextColor={c.muted} className="p-3 align-top text-body text-text" placeholder="The right words" value={words} onChangeText={(t) => setWords(t.slice(0, TRANSCRIPT_TEXT_MAX))} multiline maxLength={TRANSCRIPT_TEXT_MAX} accessibilityLabel="It should say" />
        </Textarea>
        {state === 'failed' ? <Text className="text-body text-accent mt-gap">That did not send. Try again when you're online.</Text> : null}
        <Box className="gap-1 mt-row">
          <Pressable onPress={() => { void send(); }} disabled={!changed || state === 'sending'} accessibilityRole="button" accessibilityLabel="Send the correction" accessibilityState={{ disabled: !changed || state === 'sending' }} className={`items-center justify-center bg-primary rounded-pill ${!changed || state === 'sending' ? 'opacity-40' : ''}`} style={TAP}>
            <BusyContent busy={state === 'sending'} barClassName="bg-onPrimary">
              <Text className="text-sm font-bold text-onPrimary">Send</Text>
            </BusyContent>
          </Pressable>
          <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Cancel" className="items-center justify-center" style={TAP}>
            <Text className="text-body font-bold text-accent">Cancel</Text>
          </Pressable>
        </Box>
      </ActionsheetContent>
    </Actionsheet>
  );
}
