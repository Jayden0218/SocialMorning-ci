// Sheet to report a comment: pick a reason, add a note, send.
/**
 * M6 US1: the report sheet — one reason from the fixed list, an optional note, one tap
 * to send. Signed out → sign in first; own content → "delete it instead". The hide is
 * local and instant (src/safety/hidden.ts); the sheet only collects the reason.
 *
 * M31 W2-B (`social.html` `reportSheet`, `comments--report-sheet`): the kit sheet. "Report comment" in Unbounded 800 26 and
 * "Choose one reason." (Note 14/20, text2); the seven reasons as 52 tiles, two a row (radius 16, 8 apart) — a flag, the
 * words, and when chosen a light fill with void words and a check; the odd last one, "Something else", takes the full
 * width; the note field (radius 18, 64 tall, borderless; its 500 count only near the limit); "Send report" as a hot 48 pill; Cancel as a 14 tall text action under it (48 pt hit area). Same
 * reasons, note, handlers and props as before; the sheet lifts above the keyboard.
 */
import { useState } from 'react';
import { router } from 'expo-router';
import { REPORT_NOTE_MAX, REPORT_REASONS, type ReportReason } from '@socialmorning/social-core';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Icon } from '@/ui/kit/Icon';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { colour } from '@/design';
import { announce, useSafety } from '@/safety/context';
import type { HiddenKind } from '@/storage/types';
import { COMMENTS } from './measures';

export const REASON_LABEL: Record<ReportReason, string> = {
  spam: 'Spam', harassment: 'Harassment', hate: 'Hate', sexual: 'Sexual content', violence: 'Violence', illegal: 'Illegal content', other: 'Something else',
};

export type ReportTarget = { kind: HiddenKind; id: string; authorId: string | null; label: string };

/** The note's 500 count shows from here (the drawing has none). */
const NOTE_COUNT_FROM = 400;
const CANCEL_SLOP = { top: 14, bottom: 20, left: 40, right: 40 };
const TILE = { minHeight: COMMENTS.reasonHeight, borderRadius: COMMENTS.reasonRadius, paddingHorizontal: 12, gap: 8 };

export function ReportSheet(props: { target: ReportTarget | undefined; onClose: () => void; onReported?: () => void }): React.ReactElement {
  const { safety } = useSafety();
  const [reason, setReason] = useState<ReportReason | undefined>();
  const [note, setNote] = useState('');
  const [own, setOwn] = useState(false);
  /** The reasons in rows of two; the odd last one ("Something else") takes the full width. */
  const reasonRows: ReportReason[][] = [];
  for (let i = 0; i < REPORT_REASONS.length; i += 2) reasonRows.push(REPORT_REASONS.slice(i, i + 2));
  const close = () => { setReason(undefined); setNote(''); setOwn(false); props.onClose(); };

  function send() {
    if (!props.target || !reason) return;
    const r = safety.report(props.target.kind, props.target.id, props.target.authorId, reason, note.trim() || undefined);
    if (r === 'sign_in') { close(); router.push('/auth/sign-in'); return; }
    if (r === 'own') { setOwn(true); return; }
    announce('Reported. Hidden for you.');
    close();
    props.onReported?.();
  }

  return (
    // Each reason is a radio button with a checked state, so VoiceOver reaches all 7 (iOS i7: the radio rows were not in the tree).
    <ActionSheet open={props.target !== undefined} onClose={close} label={`Report ${props.target?.label ?? ''}`} keyboard>
      <Box className="gap-hair">
        <Type step="hero" className="text-text" accessibilityRole="header" style={{ fontSize: COMMENTS.titleSize, lineHeight: COMMENTS.titleLine }}>Report {props.target?.label ?? ''}</Type>
        <Type step="note" className="text-text2">Choose one reason.</Type>
      </Box>
      {own ? <Type step="note" className="text-hotText">That's yours — delete it instead.</Type> : null}
      <Box accessibilityRole="radiogroup" accessibilityLabel="Reason" style={{ gap: 8 }}>
        {reasonRows.map((pair) => (
          <Box key={pair.join('|')} className="flex-row" style={{ gap: 8 }}>
            {pair.map((r) => {
              const on = reason === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => setReason(r)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={REASON_LABEL[r]}
                  className={`flex-1 flex-row items-center ${on ? 'bg-text' : 'bg-raise border border-line'}`}
                  style={TILE}
                >
                  <Icon name={on ? 'checkmark' : r === 'other' ? 'ellipsis-horizontal' : 'flag-outline'} size={16} color={on ? colour.void : colour.text} />
                  <Type step="compact" className={on ? 'text-void flex-1' : 'text-text flex-1'} numberOfLines={1}>{REASON_LABEL[r]}</Type>
                </Pressable>
              );
            })}
          </Box>
        ))}
      </Box>
      {/* Drawn `.field` (64 tall, radius 18, raise2 on the raise2 sheet — no border, no counter row). The server's 500-character
          limit stays (maxLength); its count shows only near the limit, inside the field's corner, so the sheet is not taller. */}
      <Box className="relative">
        <Textarea className="h-auto border-0 bg-raise2" style={{ height: COMMENTS.noteHeight, borderRadius: COMMENTS.writeRadius }}>
          <TextareaInput placeholderTextColor={colour.text3} className="text-pulse-note text-text align-top" style={{ paddingHorizontal: 14, paddingTop: 12 }} placeholder="Note, optional" value={note} onChangeText={(t) => setNote(t.slice(0, REPORT_NOTE_MAX))} multiline maxLength={REPORT_NOTE_MAX} accessibilityLabel="Note, optional" />
        </Textarea>
        {note.length >= NOTE_COUNT_FROM ? <Type step="mono" testID="report-note-count" className="absolute text-text3" style={{ right: 14, bottom: 6 }}>{note.length} / {REPORT_NOTE_MAX}</Type> : null}
      </Box>
      <PulseButton label="Send report" kind="hot" onPress={send} disabled={!reason} full />
      {/* Drawn: a 14 tall text line. The 48 pt tap is its hitSlop (14 up to the Send pill, 20 down into the sheet's foot). */}
      <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={CANCEL_SLOP} testID="report-cancel" className="items-center justify-center" style={{ height: COMMENTS.cancelHeight }}>
        <Type step="compact" className="text-text2" style={{ lineHeight: COMMENTS.cancelHeight }}>Cancel</Type>
      </Pressable>
    </ActionSheet>
  );
}
