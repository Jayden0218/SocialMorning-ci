// The sheet to report a wrong transcript line: the line as it is, a box for the right words, Send.
/**
 * M21 US2 (spec story 2, scenario 6). Kept apart from `TranscriptPane` so the pane stays a plain
 * component with no app context (its tests render it bare).
 *
 * M31 T024: the player's two-line peek (now and next, with ⤢) that lived here is gone — the
 * transcript is a sheet you drag between half and full (`TranscriptSheet`), whose square icon opens
 * the full-screen page (design-pulse2 `player--transcript-pane` action map).
 */
import { useState } from 'react';
import { router } from 'expo-router';
import type { TranscriptLine } from '@socialmorning/player-core';
import { Type } from '@/ui/kit/Type';
import { Box } from '@/ui/lib/box';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { mmss } from '@/ui/kit/format';
import { useColours } from '@/ui/kit/useColours';
import { radius, spacing, tabular } from '@/design';
import { useSocial } from '@/social/context';
import { announce } from '@/safety/context';

/** What the server keeps of a line and of the correction (contracts/api.md). */
export const TRANSCRIPT_TEXT_MAX = 500;

/**
 * M21 US2 (scenario 6): "Report a mistake" — the line as it is, a box for the right words, Send.
 * Signed out → the sign-in page. The report goes to POST /v1/reports (targetKind 'transcript').
 */
export function TranscriptReportSheet(props: { episodeId: string; line: TranscriptLine | undefined; onClose: () => void }): React.ReactElement | null {
  const c = useColours();
  const { api, listener } = useSocial();
  const [words, setWords] = useState(() => props.line?.text.slice(0, TRANSCRIPT_TEXT_MAX) ?? '');
  const [state, setState] = useState<'idle' | 'sending' | 'failed'>('idle');
  const open = props.line !== undefined;
  // A different line starts the field over with that line's words.
  const [seenLine, setSeenLine] = useState(props.line);
  if (seenLine !== props.line) {
    setSeenLine(props.line);
    setWords(props.line?.text.slice(0, TRANSCRIPT_TEXT_MAX) ?? '');
    setState('idle');
  }
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
    <ActionSheet open={open} onClose={props.onClose} label="Report a mistake" title="Report a mistake" keyboard>
      {props.line ? <Type step="caption" className="text-text2" style={tabular}>{`At ${mmss(props.line.startMs)} it says:`}</Type> : null}
      {props.line ? (
        <Box className="bg-raise" style={{ borderRadius: radius.input, padding: spacing.row }}>
          <Type step="body" className="text-text italic" numberOfLines={4}>{`\u201c${props.line.text}\u201d`}</Type>
        </Box>
      ) : null}
      <Type step="tag" className="text-text3">It should say</Type>
      <Textarea className="bg-raise border-0 h-auto" style={{ minHeight: 90, borderRadius: radius.input }}>
        <TextareaInput placeholderTextColor={c.text3} className="align-top text-pulse-body text-text" style={{ padding: spacing.row }} placeholder="The right words" value={words} onChangeText={(t) => setWords(t.slice(0, TRANSCRIPT_TEXT_MAX))} multiline maxLength={TRANSCRIPT_TEXT_MAX} accessibilityLabel="It should say" />
      </Textarea>
      {state === 'failed' ? <Type step="body" className="text-hotText">That did not send. Try again when you're online.</Type> : null}
      <Type step="note" className="text-text3">The show's host sees the line and your words in their Studio.</Type>
      <Box className="flex-row" style={{ gap: 10 }}>
        <Box className="flex-1"><PulseButton label="Cancel" kind="quiet" full onPress={props.onClose} /></Box>
        <Box className="flex-1"><PulseButton label="Send" kind="light" full accessibilityLabel="Send the correction" disabled={!changed} busy={state === 'sending'} onPress={() => { void send(); }} /></Box>
      </Box>
    </ActionSheet>
  );
}
