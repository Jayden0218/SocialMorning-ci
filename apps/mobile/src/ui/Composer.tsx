/**
 * The comment box (US1). The moment chip shows what `captureMoment` returned
 * when the box opened; the ✕ removes it; nothing here re-reads the player.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { mmss } from './format';
import { useSocial } from '../social/context';
import type { ComposerState } from '../social/composer';

export function ComposerSheet(props: {
  initial: ComposerState;
  onClose: () => void;
  onPosted: () => void;
}): React.ReactElement {
  const { composer, bump } = useSocial();
  const [state, setState] = useState<ComposerState>(props.initial);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const length = state.body.trim().length;

  async function submit() {
    setBusy(true);
    setError(undefined);
    const r = await composer.submit(state);
    setBusy(false);
    if (r.kind === 'posted') {
      bump(state.episodeId);
      props.onPosted();
      props.onClose();
    } else if (r.kind === 'needsSignIn') {
      // The draft (text + moment) is saved; the listener comes back to it.
      props.onClose();
      router.push('/auth/sign-in');
    } else {
      setError(r.error.code === 'network' ? "Couldn't reach the server — your draft is kept." : r.error.message);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={props.onClose} transparent>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.sheet}>
          <View style={styles.row}>
            {state.moment ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>at {mmss(state.moment.offsetMs)}</Text>
                <Pressable onPress={() => setState(composer.removeMoment(state))} accessibilityLabel="Remove the moment" accessibilityRole="button">
                  <Text style={styles.chipX}>✕</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.muted}>{state.parentId ? 'Reply' : 'No moment attached'}</Text>
            )}
            <Text style={[styles.muted, length > 2000 && styles.over]}>{length} / 2000</Text>
          </View>
          <TextInput
            style={styles.input}
            multiline
            autoFocus
            placeholder={state.parentId ? 'Write a reply' : 'What is worth saying here?'}
            value={state.body}
            onChangeText={(t) => setState(composer.edit(state, t))}
            accessibilityLabel="Comment"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <Pressable onPress={props.onClose} accessibilityRole="button"><Text style={styles.link}>Cancel</Text></Pressable>
            <Pressable
              style={[styles.button, (busy || !composer.canSubmit(state)) && styles.disabled]}
              disabled={busy || !composer.canSubmit(state)}
              onPress={submit}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Post</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#fff', padding: 16, gap: 10, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chip: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#eef', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  chipText: { fontWeight: '600' },
  chipX: { fontSize: 14, color: '#446' },
  muted: { color: '#666' },
  over: { color: '#b00020' },
  input: { minHeight: 90, maxHeight: 200, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 16, textAlignVertical: 'top' },
  error: { color: '#b00020' },
  link: { color: '#0645ad', fontSize: 15 },
  button: { backgroundColor: '#222', borderRadius: 24, paddingVertical: 10, paddingHorizontal: 22 },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
