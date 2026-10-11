// The box where you write a comment or reply, with its moment in time.
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
 *
 * M20 US9 (FR-053, FR-054): "Add a picture" — one photo, shrunk on the phone — shown only when the
 * server says images are on (gate G1). The comment posts first; the picture follows it. If the
 * picture fails, the comment stays and the listener is told.
 *
 * M21 US6 (G-M21-7): the first post answers 428 rules_required — the sheet then shows the
 * community rules in place of the form (RulesBody). Accept sends the comment again; Not now goes
 * back to the form with the draft kept, and nothing is sent.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { KeyboardAvoidingView } from '@/ui/lib/keyboard-avoiding-view';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent } from '@/ui/lib/actionsheet';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { hit } from '@/design';
import { mmss } from '@/ui/kit/format';
import { useSocial } from '@/social/context';
import type { ComposerState } from '@/social/composer';
import { useStores, useToast } from '@/ui/shell/providers';
import { Image } from '@/ui/lib/image';
import { needsRules, useCommentExtrasApi } from '@/social/comment-extras-api';
import { RulesBody } from './RulesSheet';
import { pickCommentImage, type PickedCommentImage } from '@/social/comment-image';
import { useColours } from '@/ui/kit/useColours';

/** The ✕ is a 48 pt square (B draws 44; the floor is 48). */
const CLOSE = { width: hit.min, height: hit.min };
/** M24 US20 (`CommentComposer-B`): the box grows to fill the sheet; 120 is its floor. */
const BOX = { minHeight: 120 };
const THUMB = { width: 64, height: 64, borderRadius: 12 };

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
  const extras = useCommentExtrasApi();
  const toast = useToast();
  const [imagesOn, setImagesOn] = useState(false);
  const [picture, setPicture] = useState<PickedCommentImage | undefined>(undefined);
  const [rules, setRules] = useState(false);
  useEffect(() => { let live = true; void extras.imagesOn().then((on) => { if (live) setImagesOn(on); }); return () => { live = false; }; }, [extras]);
  const addPicture = async () => {
    const r = await pickCommentImage();
    if (r.kind === 'ok') setPicture(r.image);
    else if (r.kind === 'denied') setError('SocialNet needs your photos to add one — allow it in the phone\'s settings.');
    else if (r.kind === 'too-big') setError('That picture is too big — choose one under 10 MB.');
  };
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
      if (picture) {
        try {
          const blob = await (await fetch(picture.uri)).blob();
          await extras.postImage(r.comment.id, blob, picture.w, picture.h);
        } catch {
          toast('Your comment is posted, but the picture did not upload.');
        }
      }
      // M24 US8: the show checks comments first — say so, since nobody else sees it yet.
      if (r.comment.held) toast('Sent. The host reviews comments here first. Until then, only you can see it.');
      bump(state.episodeId);
      props.onPosted();
      props.onClose();
    } else if (r.kind === 'needsSignIn') {
      // The draft (text + moment) is saved; the listener comes back to it.
      props.onClose();
      router.push('/auth/sign-in');
    } else if (needsRules(r.error)) {
      setRules(true);
    } else {
      setError(r.error.code === 'network' ? "Couldn't reach the server — your draft is kept."
        : r.error.code === 'comments_closed' ? 'The host has closed comments here.' : r.error.message);
    }
  }

  return (
    <Actionsheet isOpen onClose={props.onClose}>
      <ActionsheetBackdrop />
      {/* M24 US20 (`CommentComposer-B`): a full-height paper sheet from 44 pt under the top down to
          the keyboard; the text box takes the space between the episode card and the foot. */}
      <KeyboardAvoidingView className="w-full flex-1 justify-end" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ActionsheetContent className="px-0 pt-0 mt-11 items-stretch flex-1 max-h-full">
        <ScrollView className="flex-1 w-full" keyboardShouldPersistTaps="handled" scrollEnabled={false} contentContainerClassName="px-screen-x pt-row pb-section gap-row flex-grow">
          {rules ? <RulesBody onAccepted={() => { setRules(false); void submit(); }} onClose={() => setRules(false)} /> : (<>
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
            <Artwork url={episode?.imageUrl ?? show?.imageUrl} size={44} name={show?.title ?? episode?.title} />
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
          <Textarea className="flex-1 h-auto border-0 bg-clear" style={BOX}>
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
          {imagesOn ? (
            picture ? (
              <Box className="flex-row items-center gap-row">
                <Image source={{ uri: picture.uri }} style={THUMB} accessibilityLabel="The picture you added" />
                <Pressable onPress={() => setPicture(undefined)} accessibilityRole="button" accessibilityLabel="Remove the picture" className="justify-center px-row" style={{ minHeight: hit.min }}>
                  <Text className="text-accent text-body font-bold">Remove</Text>
                </Pressable>
              </Box>
            ) : (
              <Pressable onPress={() => void addPicture()} accessibilityRole="button" accessibilityLabel="Add a picture" className="self-start flex-row items-center gap-2 justify-center" style={{ minHeight: hit.min }}>
                <Icon name="image-outline" size={20} color={c.accent} />
                <Text className="text-accent text-body font-bold">Add a picture</Text>
              </Pressable>
            )
          ) : null}
          <Text className={length > 2000 ? 'text-accent text-meta text-right' : 'text-muted text-meta text-right'}>{length} / 2000</Text>
          </>)}
        </ScrollView>
        </ActionsheetContent>
      </KeyboardAvoidingView>
    </Actionsheet>
  );
}

