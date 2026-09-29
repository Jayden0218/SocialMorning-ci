/**
 * M6 US1: the report sheet — one reason from the fixed list, an optional note, one tap
 * to send. Signed out → sign in first; own content → "delete it instead". The hide is
 * local and instant (src/safety/hidden.ts); the sheet only collects the reason.
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
      <ActionsheetContent className="bg-surface rounded-t-2xl p-4 gap-2 max-h-[85%] items-stretch" accessibilityViewIsModal>
        <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
        <Heading className="text-[18px] font-bold text-text" accessibilityRole="header">Report {props.target?.label ?? ''}</Heading>
        {own ? <Text className="text-accent bg-surface p-2 rounded-md">That's yours — delete it instead.</Text> : null}
        <ActionsheetScrollView className="grow-0">
          {REPORT_REASONS.map((r) => (
            <ActionsheetItem key={r} className={`py-3 px-2 rounded-lg min-h-12 border ${reason === r ? 'border-accent' : 'border-transparent'}`} onPress={() => setReason(r)} accessibilityRole="radio" accessibilityState={{ checked: reason === r }} accessibilityLabel={REASON_LABEL[r]}>
              <ActionsheetItemText className={reason === r ? 'text-sm font-bold text-accent' : 'text-sm text-text'}>{REASON_LABEL[r]}</ActionsheetItemText>
            </ActionsheetItem>
          ))}
        </ActionsheetScrollView>
        <Textarea className="border border-separator rounded-lg min-h-16 h-auto">
          <TextareaInput placeholderTextColor={c.muted} className="p-2.5 align-top text-text" placeholder="Anything to add? (optional)" value={note} onChangeText={(t) => setNote(t.slice(0, REPORT_NOTE_MAX))} multiline maxLength={REPORT_NOTE_MAX} accessibilityLabel="Note, optional" />
        </Textarea>
        <Text className="text-muted text-xs text-right">{note.length} / {REPORT_NOTE_MAX}</Text>
        <Box className="flex-row justify-end gap-3">
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Cancel" className="py-3 px-4 min-h-12 justify-center"><Text className="text-accent text-sm">Cancel</Text></Pressable>
          <Pressable onPress={send} disabled={!reason} accessibilityRole="button" accessibilityLabel="Send report" accessibilityState={{ disabled: !reason }} className={`py-3 px-4 min-h-12 justify-center bg-primary rounded-3xl ${!reason ? 'opacity-40' : ''}`}><Text className="text-onPrimary font-semibold">Send</Text></Pressable>
        </Box>
      </ActionsheetContent>
    </Actionsheet>
  );
}

