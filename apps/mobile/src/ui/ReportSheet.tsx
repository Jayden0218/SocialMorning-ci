/**
 * M6 US1: the report sheet — one reason from the fixed list, an optional note, one tap
 * to send. Signed out → sign in first; own content → "delete it instead". The hide is
 * local and instant (src/safety/hidden.ts); the sheet only collects the reason.
 *
 * M17 T100 (`ReportSheet-B`): an accent eyebrow ("Hidden for you once sent" — what `send`
 * does), a 32 pt serif "Report …" title and a muted "Choose one reason."; the seven reasons are
 * white tiles in two columns (chosen = yellow with a check; the odd last one spans the row); the
 * note is a white box under a bold label; Send is a full-width yellow pill with Cancel below it
 * as an accent text action. Same reasons, note, handlers and props as before.
 */
import { useState } from 'react';
import { Pressable } from './lib/pressable';
import { Text } from './lib/text';
import { Heading } from './lib/heading';
import { Box } from './lib/box';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper, ActionsheetItem, ActionsheetItemText, ActionsheetScrollView } from './lib/actionsheet';
import { Textarea, TextareaInput } from './lib/textarea';
import { router } from 'expo-router';
import { REPORT_NOTE_MAX, REPORT_REASONS, type ReportReason } from '@socialmorning/social-core';
import { announce, useSafety } from '../safety/context';
import type { HiddenKind } from '../storage/types';
import { useStores } from './providers';
import { useColours } from './useColours';
import { Eyebrow } from './Eyebrow';
import { Icon } from './Icon';

/** M17: a reason tile and the Send pill are 52 pt in `ReportSheet-B`. */
const REASON = { minHeight: 52 };

export const REASON_LABEL: Record<ReportReason, string> = {
  spam: 'Spam', harassment: 'Harassment', hate: 'Hate', sexual: 'Sexual content', violence: 'Violence', illegal: 'Illegal content', other: 'Something else',
};

export type ReportTarget = { kind: HiddenKind; id: string; authorId: string | null; label: string };

export function ReportSheet(props: { target: ReportTarget | undefined; onClose: () => void; onReported?: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const { safety } = useSafety();
  const [reason, setReason] = useState<ReportReason | undefined>();
  const [note, setNote] = useState('');
  const [own, setOwn] = useState(false);
  /** M17: the reasons in rows of two; the odd last one ("Something else") takes the full width. */
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
    // M9: gluestack's Actionsheet. Each reason is an ActionsheetItem — a real button with a
    // selected state — so VoiceOver can reach all 7 (iOS i7: the radio rows were not in the tree).
    <Actionsheet isOpen={props.target !== undefined} onClose={close}>
      <ActionsheetBackdrop />
      {/* M16a T014 / guard G-S1: no fixed bottom padding — ActionsheetContent's own `pb-safe` clears the home indicator. */}
      <ActionsheetContent className="bg-surface rounded-t-row px-screen-x pt-row max-h-[85%] items-stretch" accessibilityViewIsModal>
        <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
        <Eyebrow accent className="mt-gap">Hidden for you once sent</Eyebrow>
        <Heading className="text-display font-display text-text mt-1" accessibilityRole="header">Report {props.target?.label ?? ''}</Heading>
        <Text className="text-body text-muted mt-1">Choose one reason.</Text>
        {own ? <Text className="text-body text-accent mt-gap">That's yours — delete it instead.</Text> : null}
        <ActionsheetScrollView className="grow-0 mt-row">
          <Box className="gap-gap" accessibilityRole="radiogroup" accessibilityLabel="Reason">
            {reasonRows.map((pair) => (
              <Box key={pair.join('|')} className="flex-row gap-gap">
                {pair.map((r) => (
                  <ActionsheetItem key={r} className={`flex-1 w-auto flex-row items-center justify-between px-3.5 rounded-row min-h-12 ${reason === r ? 'bg-primary border border-primary' : 'bg-surface border border-border'}`} style={REASON} onPress={() => setReason(r)} accessibilityRole="radio" accessibilityState={{ checked: reason === r }} accessibilityLabel={REASON_LABEL[r]}>
                    <ActionsheetItemText className={reason === r ? 'text-body font-bold text-onPrimary' : 'text-body font-semibold text-text'}>{REASON_LABEL[r]}</ActionsheetItemText>
                    {reason === r ? <Icon name="checkmark" size={18} color={c.onPrimary} /> : null}
                  </ActionsheetItem>
                ))}
              </Box>
            ))}
          </Box>
        </ActionsheetScrollView>
        <Text className="text-meta font-bold text-text mt-section mb-1.5">Note, optional</Text>
        <Textarea className="bg-surface border border-border rounded-row min-h-16 h-auto">
          <TextareaInput placeholderTextColor={c.muted} className="p-3 align-top text-body text-text" placeholder="Anything to add? (optional)" value={note} onChangeText={(t) => setNote(t.slice(0, REPORT_NOTE_MAX))} multiline maxLength={REPORT_NOTE_MAX} accessibilityLabel="Note, optional" />
        </Textarea>
        <Text className="text-muted text-xs text-right mt-1">{note.length} / {REPORT_NOTE_MAX}</Text>
        <Box className="gap-1 mt-row">
          <Pressable onPress={send} disabled={!reason} accessibilityRole="button" accessibilityLabel="Send report" accessibilityState={{ disabled: !reason }} className={`min-h-12 items-center justify-center bg-primary rounded-pill ${!reason ? 'opacity-40' : ''}`} style={REASON}><Text className="text-sm font-bold text-onPrimary">Send</Text></Pressable>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Cancel" className="min-h-12 items-center justify-center"><Text className="text-body font-bold text-accent">Cancel</Text></Pressable>
        </Box>
      </ActionsheetContent>
    </Actionsheet>
  );
}

