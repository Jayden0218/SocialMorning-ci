/**
 * The comment box (US1). The moment chip shows what `captureMoment` returned
 * when the box opened; the ✕ removes it; nothing here re-reads the player.
 * M9: a gluestack Actionsheet with a Textarea. Its body sits in a ScrollView that keeps
 * taps while the keyboard is up, so the first tap on Post posts (iOS i3: it only closed
 * the keyboard, and a second tap posted).
 */
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { KeyboardAvoidingView } from './lib/keyboard-avoiding-view';
import { Pressable } from './lib/pressable';
import { ScrollView } from './lib/scroll-view';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent } from './lib/actionsheet';
import { Textarea, TextareaInput } from './lib/textarea';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { mmss } from './format';
import { useSocial } from '../social/context';
import type { ComposerState } from '../social/composer';
import { useStores } from './providers';
import { useColours } from './useColours';

export function ComposerSheet(props: {
  initial: ComposerState;
  onClose: () => void;
  onPosted: () => void;
}): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const { composer, bump } = useSocial();
  const [state, setState] = useState<ComposerState>(props.initial);
  // The draft is saved 250 ms after typing stops, not on every key: the save is a synchronous
  // SQLite write, and on 2026-09-30 fast typing lost letters in this box — on the iPhone
  // ("iPhne", "nte") and in the simulator journey ("herd"). The text itself updates at once.
  const unsaved = useRef<ComposerState | undefined>(undefined);
  useEffect(() => {
    if (!unsaved.current) return;
    const t = setTimeout(() => { if (unsaved.current) { composer.edit(unsaved.current, unsaved.current.body); unsaved.current = undefined; } }, 250);
    return () => clearTimeout(t);
  }, [state.body, composer]);
  // Closing the box keeps what was typed (posting saves and clears `unsaved` first).
  useEffect(() => () => { if (unsaved.current) composer.edit(unsaved.current, unsaved.current.body); }, [composer]);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const length = state.body.trim().length;

  async function submit() {
    setBusy(true);
    setError(undefined);
    // Save what is typed first, so a failed post keeps the whole draft; a posted one clears it.
    if (unsaved.current) { composer.edit(unsaved.current, unsaved.current.body); unsaved.current = undefined; }
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
    <Actionsheet isOpen onClose={props.onClose}>
      <ActionsheetBackdrop />
      <KeyboardAvoidingView className="w-full justify-end" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ActionsheetContent className="bg-surface p-0 rounded-t-2xl items-stretch">
        <ScrollView keyboardShouldPersistTaps="handled" scrollEnabled={false} contentContainerClassName="px-screen-x py-section gap-2.5">
          <Box className="flex-row justify-between items-center">
            {state.moment ? (
              <Box className="flex-row gap-2 items-center bg-surface rounded-pill py-1 px-2.5">
                <Text className="font-semibold text-text">at {mmss(state.moment.offsetMs)}</Text>
                <Pressable onPress={() => setState(composer.removeMoment(state))} accessibilityLabel="Remove the moment" accessibilityRole="button">
                  <Text className="text-[14px] text-muted">✕</Text>
                </Pressable>
              </Box>
            ) : (
              <Text className="text-muted">{state.parentId ? 'Reply' : 'No moment attached'}</Text>
            )}
            <Text className={length > 2000 ? 'text-accent' : 'text-muted'}>{length} / 2000</Text>
          </Box>
          <Textarea className="min-h-[90px] max-h-[200px] h-auto border border-separator rounded-lg">
          <TextareaInput
            placeholderTextColor={c.muted}
            className="p-2.5 text-sm align-top text-text"
            multiline
            autoFocus
            placeholder={state.parentId ? 'Write a reply' : 'What is worth saying here?'}
            // Uncontrolled: the box keeps its own text and the sheet only listens. Controlled
            // (value={state.body}), the text written back during fast typing moved the cursor to
            // the end — the simulator journey stored "Mao: heard it on the simulatores" for
            // "Maestro: heard it on the simulator" (run 36710217453).
            defaultValue={props.initial.body}
            onChangeText={(t) => setState((s) => { const next = { ...s, body: t }; unsaved.current = next; return next; })}
            accessibilityLabel="Comment"
          />
          </Textarea>
          {error ? <Text className="text-accent">{error}</Text> : null}
          <Box className="flex-row justify-between items-center">
            <Pressable onPress={props.onClose} accessibilityRole="button" className="min-h-12 justify-center"><Text className="text-accent text-[15px]">Cancel</Text></Pressable>
            <Pressable
              className={`bg-primary rounded-3xl py-2.5 px-[22px] ${busy || !composer.canSubmit(state) ? 'opacity-50' : ''}`}
              disabled={busy || !composer.canSubmit(state)}
              onPress={submit}
              accessibilityRole="button"
            >
              <Text className="text-onPrimary font-semibold">Post</Text>
            </Pressable>
          </Box>
        </ScrollView>
        </ActionsheetContent>
      </KeyboardAvoidingView>
    </Actionsheet>
  );
}

