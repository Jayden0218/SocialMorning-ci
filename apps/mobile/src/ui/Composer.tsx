/**
 * The comment box (US1). The moment chip shows what `captureMoment` returned
 * when the box opened; the ✕ removes it; nothing here re-reads the player.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { mmss } from './format';
import { useSocial } from '../social/context';
import type { ComposerState } from '../social/composer';
import { colour } from '../design';

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
      <KeyboardAvoidingView className="flex-1 justify-end bg-scrim" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View className="bg-surface p-4 gap-2.5 rounded-t-2xl">
          <View className="flex-row justify-between items-center">
            {state.moment ? (
              <View className="flex-row gap-2 items-center bg-surface rounded-pill py-1 px-2.5">
                <Text className="font-semibold text-text">at {mmss(state.moment.offsetMs)}</Text>
                <Pressable onPress={() => setState(composer.removeMoment(state))} accessibilityLabel="Remove the moment" accessibilityRole="button">
                  <Text className="text-[14px] text-muted">✕</Text>
                </Pressable>
              </View>
            ) : (
              <Text className="text-muted">{state.parentId ? 'Reply' : 'No moment attached'}</Text>
            )}
            <Text className={length > 2000 ? 'text-accent' : 'text-muted'}>{length} / 2000</Text>
          </View>
          <TextInput
        placeholderTextColor={colour.muted}
            className="min-h-[90px] max-h-[200px] border border-separator rounded-lg p-2.5 text-sm align-top text-text"
            multiline
            autoFocus
            placeholder={state.parentId ? 'Write a reply' : 'What is worth saying here?'}
            value={state.body}
            onChangeText={(t) => setState(composer.edit(state, t))}
            accessibilityLabel="Comment"
          />
          {error ? <Text className="text-accent">{error}</Text> : null}
          <View className="flex-row justify-between items-center">
            <Pressable onPress={props.onClose} accessibilityRole="button"><Text className="text-accent text-[15px]">Cancel</Text></Pressable>
            <Pressable
              className={`bg-accent rounded-3xl py-2.5 px-[22px] ${busy || !composer.canSubmit(state) ? 'opacity-50' : ''}`}
              disabled={busy || !composer.canSubmit(state)}
              onPress={submit}
              accessibilityRole="button"
            >
              <Text className="text-text font-semibold">Post</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

