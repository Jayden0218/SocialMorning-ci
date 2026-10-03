/**
 * The comment box (US1). The moment chip shows what `captureMoment` returned
 * when the box opened; the ✕ removes it; nothing here re-reads the player.
 * M9: a gluestack Actionsheet with a Textarea. Its body sits in a ScrollView that keeps
 * taps while the keyboard is up, so the first tap on Post posts (iOS i3: it only closed
 * the keyboard, and a second tap posted).
 *
 * M17 T104 (`CommentComposer-B`): a header row — Cancel (accent) · serif "New comment" (or
 * "Reply") · the yellow Post pill — then the episode on a white card with the moment as an
 * accent "At 14:32" line and the ✕ beside it, a borderless serif text box, and the count at the
 * bottom right. Posting, the moment, reply mode, the 2000 limit and the keyboard are unchanged.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';
import { KeyboardAvoidingView } from '@/ui/lib/keyboard-avoiding-view';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent } from '@/ui/lib/actionsheet';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Artwork } from './Artwork';
import { Icon } from './Icon';
import { hit } from '@/design';
import { mmss } from './format';
import { useSocial } from '@/social/context';
import type { ComposerState } from '@/social/composer';
import { useStores } from './providers';
import { useColours } from './useColours';

/** The ✕ is a 48 pt square (B draws 44; the floor is 48). */
const CLOSE = { width: hit.min, height: hit.min };
const BOX = { minHeight: 120, maxHeight: 240 };

export function ComposerSheet(props: {
  initial: ComposerState;
  onClose: () => void;
  onPosted: () => void;
}): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const { composer, bump } = useSocial();
  const [state, setState] = useState<ComposerState>(props.initial);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const length = state.body.trim().length;
  const episode = stores.feeds.getEpisode(state.episodeId);
  const show = episode ? stores.feeds.getShow(episode.feedUrl) : undefined;
  const cannot = busy || !composer.canSubmit(state);

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
    <Actionsheet isOpen onClose={props.onClose}>
      <ActionsheetBackdrop />
      <KeyboardAvoidingView className="w-full justify-end" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ActionsheetContent className="bg-surface px-0 pt-0 rounded-t-row items-stretch">
        <ScrollView keyboardShouldPersistTaps="handled" scrollEnabled={false} contentContainerClassName="px-screen-x pt-row pb-section gap-row">
          <Box className="flex-row justify-between items-center gap-gap">
            <Pressable onPress={props.onClose} accessibilityRole="button" className="min-h-12 justify-center pr-row"><Text className="text-accent text-body font-bold">Cancel</Text></Pressable>
            <Text className="text-text text-base font-display flex-1 text-center" numberOfLines={1} accessibilityRole="header">{state.parentId ? 'Reply' : 'New comment'}</Text>
            <Pressable
              className={`bg-primary rounded-pill justify-center px-[22px] ${cannot ? 'opacity-50' : ''}`}
              style={{ minHeight: hit.min }}
              disabled={cannot}
              onPress={submit}
              accessibilityRole="button"
            >
              <Text className="text-onPrimary text-body font-bold">Post</Text>
            </Pressable>
          </Box>
          {/* The episode, with the moment the comment is pinned to (removable). */}
          <Box className="flex-row items-center gap-row bg-surface border border-border rounded-row py-row pl-row pr-1">
            <Artwork url={episode?.imageUrl ?? show?.imageUrl} size={44} rounded="row" name={show?.title ?? episode?.title} />
            <Box className="flex-1">
              {state.moment
                ? <Text className="text-accent text-xs font-bold">At {mmss(state.moment.offsetMs)}</Text>
                : <Text className="text-muted text-xs font-bold">{state.parentId ? 'Reply' : 'No moment attached'}</Text>}
              {episode ? <Text className="text-muted text-meta" numberOfLines={1}>{episode.title}</Text> : null}
            </Box>
            {state.moment ? (
              <Pressable onPress={() => setState(composer.removeMoment(state))} accessibilityLabel="Remove the moment" accessibilityRole="button" className="items-center justify-center" style={CLOSE}>
                <Icon name="close" size={20} color={c.muted} />
              </Pressable>
            ) : null}
          </Box>
          <Textarea className="h-auto border-0 bg-clear" style={BOX}>
          <TextareaInput
            placeholderTextColor={c.muted}
            className="p-0 text-base font-display align-top text-text"
            multiline
            autoFocus
            placeholder={state.parentId ? 'Write a reply' : 'What is worth saying here?'}
            value={state.body}
            onChangeText={(t) => setState(composer.edit(state, t))}
            accessibilityLabel="Comment"
          />
          </Textarea>
          {error ? <Text className="text-accent text-meta">{error}</Text> : null}
          <Text className={length > 2000 ? 'text-accent text-meta text-right' : 'text-muted text-meta text-right'}>{length} / 2000</Text>
        </ScrollView>
        </ActionsheetContent>
      </KeyboardAvoidingView>
    </Actionsheet>
  );
}

