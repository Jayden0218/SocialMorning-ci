/**
 * M6 US1: the report sheet — one reason from the fixed list, an optional note, one tap
 * to send. Signed out → sign in first; own content → "delete it instead". The hide is
 * local and instant (src/safety/hidden.ts); the sheet only collects the reason.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { REPORT_NOTE_MAX, REPORT_REASONS, type ReportReason } from '@socialmorning/social-core';
import { announce, useSafety } from '../safety/context';
import type { HiddenKind } from '../storage/types';

export const REASON_LABEL: Record<ReportReason, string> = {
  spam: 'Spam', harassment: 'Harassment', hate: 'Hate', sexual: 'Sexual content', violence: 'Violence', illegal: 'Illegal content', other: 'Something else',
};

export type ReportTarget = { kind: HiddenKind; id: string; authorId: string | null; label: string };

export function ReportSheet(props: { target: ReportTarget | undefined; onClose: () => void; onReported?: () => void }): React.ReactElement {
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
    <Modal visible={props.target !== undefined} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.h1} accessibilityRole="header">Report {props.target?.label ?? ''}</Text>
          {own ? <Text style={styles.notice}>That's yours — delete it instead.</Text> : null}
          <ScrollView style={styles.list}>
            {REPORT_REASONS.map((r) => (
              <Pressable key={r} style={[styles.reason, reason === r && styles.reasonOn]} onPress={() => setReason(r)} accessibilityRole="radio" accessibilityState={{ checked: reason === r }} accessibilityLabel={REASON_LABEL[r]}>
                <Text style={[styles.reasonText, reason === r && styles.reasonTextOn]}>{REASON_LABEL[r]}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput style={styles.note} placeholder="Anything to add? (optional)" value={note} onChangeText={(t) => setNote(t.slice(0, REPORT_NOTE_MAX))} multiline maxLength={REPORT_NOTE_MAX} accessibilityLabel="Note, optional" />
          <Text style={styles.counter}>{note.length} / {REPORT_NOTE_MAX}</Text>
          <View style={styles.row}>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Cancel" style={styles.btn}><Text style={styles.link}>Cancel</Text></Pressable>
            <Pressable onPress={send} disabled={!reason} accessibilityRole="button" accessibilityLabel="Send report" accessibilityState={{ disabled: !reason }} style={[styles.btn, styles.send, !reason && styles.off]}><Text style={styles.sendText}>Send</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 8, maxHeight: '85%' },
  h1: { fontSize: 18, fontWeight: '700' },
  notice: { color: '#8a5a00', backgroundColor: '#fff4d6', padding: 8, borderRadius: 6 },
  list: { flexGrow: 0 },
  reason: { paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8, minHeight: 48 },
  reasonOn: { backgroundColor: '#eef' },
  reasonText: { fontSize: 16 },
  reasonTextOn: { fontWeight: '700', color: '#0645ad' },
  note: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, minHeight: 64, textAlignVertical: 'top' },
  counter: { color: '#666', fontSize: 12, textAlign: 'right' },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  btn: { paddingVertical: 12, paddingHorizontal: 16, minHeight: 48, justifyContent: 'center' },
  send: { backgroundColor: '#111', borderRadius: 24 },
  off: { opacity: 0.4 },
  sendText: { color: '#fff', fontWeight: '600' },
  link: { color: '#0645ad', fontSize: 16 },
});
