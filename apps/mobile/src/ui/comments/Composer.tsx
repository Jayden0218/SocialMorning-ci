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
 *
 * M31 W2-B (`social.html` `composerSheet`, `comments--composer-sheet`, `-reply-composer`, `-community-rules`): the kit sheet, lifted
 * by the keyboard — a head row (Cancel in text2 · "New comment" / "Reply" in Unbounded 700 17 · Post as a hot 38 pill, dim until
 * there is text), the moment card (raise, radius 16, padding 10: a 44 cover, the hot "At 14:32" chip or "Reply", the episode in
 * text2, and the × that removes the moment), the write box (min 120, radius 18, raise, 16/24), then the "Add a picture" chip with
 * the count in mono. An error is one hot-text line under the box. The first post's rules replace the form in place (a raise card).
 */
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { Image } from '@/ui/lib/image';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { IconButton } from '@/ui/kit/PulseButton';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { colour } from '@/design';
import { mmss } from '@/ui/kit/format';
import { useSocial } from '@/social/context';
import type { ComposerState } from '@/social/composer';
import { useStores, useToast } from '@/ui/shell/providers';
import { needsRules, useCommentExtrasApi } from '@/social/comment-extras-api';
import { RulesBody } from './RulesSheet';
import { pickCommentImage, type PickedCommentImage } from '@/social/comment-image';
import { COMMENTS } from './measures';
import { drawnType } from '@/design/type-px';

const POST = { height: COMMENTS.postHeight, paddingHorizontal: COMMENTS.postPad };
const MOMENT = { borderRadius: COMMENTS.momentCardRadius, padding: COMMENTS.momentCardPad, gap: 10 };
const BOX = { minHeight: COMMENTS.writeMin, borderRadius: COMMENTS.writeRadius };
/** Cancel is text in a 38 tall head row (the Post pill sets the height): its 48 pt tap is the hitSlop. */
const CANCEL_SLOP = { top: 14, bottom: 14, left: 8, right: 8 };
const THUMB = { width: 64, height: 64, borderRadius: 12 };

export function ComposerSheet(props: {
  initial: ComposerState;
  /** The composer's image button opened it: ask for the picture as soon as pictures are known to be on. */
  pickPicture?: boolean;
  onClose: () => void;
  onPosted: () => void;
}): React.ReactElement {
  const stores = useStores();
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
  const asked = useRef(false);
  useEffect(() => { if (props.pickPicture === true && imagesOn && !asked.current) { asked.current = true; void addPicture(); } });
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

  // Drawn (`social.html` `composerSheet`): the head row stays above the form AND above the rules card.
  const head = (
    <Box className="flex-row items-center justify-between" style={{ gap: 8 }}>
      <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={CANCEL_SLOP} className="justify-center" style={{ minWidth: 56 }}>
        <Type step="row" className="text-text2">Cancel</Type>
      </Pressable>
      <Type step="section" className="text-text font-display font-bold flex-1 text-center" numberOfLines={1} accessibilityRole="header">{state.parentId ? 'Reply' : 'New comment'}</Type>
      <Pressable
        className={`bg-hot rounded-pill justify-center items-center ${cannot ? 'opacity-50' : ''}`}
        style={POST}
        hitSlop={5}
        disabled={cannot}
        onPress={submit}
        accessibilityRole="button"
        accessibilityLabel="Post"
        accessibilityState={{ disabled: cannot, busy }}
      >
        <Type step="row" className="text-void">Post</Type>
      </Pressable>
    </Box>
  );

  return (
    <ActionSheet open onClose={props.onClose} label={state.parentId ? 'Reply' : 'New comment'} keyboard>
      {rules ? <>{head}<RulesBody card onAccepted={() => { setRules(false); void submit(); }} onClose={() => setRules(false)} /></> : (<>
        {head}
        {/* The episode, with the moment the comment is pinned to (removable). */}
        <Box className="flex-row items-center bg-raise" style={MOMENT}>
          <Artwork url={episode?.imageUrl ?? show?.imageUrl} size={COMMENTS.momentCover} name={show?.title ?? episode?.title} />
          <Box className="flex-1" style={{ gap: 2 }}>
            {state.moment && !state.parentId
              ? <TimestampChip text={`At ${mmss(state.moment.offsetMs)}`} />
              : <Type step="tag" className="text-text3">{state.parentId ? 'Reply' : 'No moment attached'}</Type>}
            {episode ? <Type step="caption" className="text-text2" numberOfLines={1}>{episode.title}</Type> : null}
          </Box>
          {state.moment && !state.parentId ? <IconButton icon="close" label="Remove the moment" onPress={() => setState(composer.removeMoment(state))} size={18} /> : null}
        </Box>
        <Textarea className="h-auto border-0 bg-raise" style={BOX}>
          <TextareaInput
            placeholderTextColor={colour.text3}
            className="text-pulse-body align-top text-text"
            style={{ ...drawnType.composer, padding: COMMENTS.writePad, minHeight: COMMENTS.writeMin }}
            multiline
            autoFocus
            placeholder={state.parentId ? 'Write a reply' : 'What is worth saying here?'}
            // M25 IJ: uncontrolled — the box owns its text and state follows it. With `value` bound,
            // a render that arrived after the next keystroke put older text back: letters dropped,
            // the cursor jumped, deletes were lost (ios-journey runs 38002770918, 38009542753:
            // "Maestro: herd it on the simulatoraestro: heard …"). Nothing rewrites the text.
            defaultValue={state.body}
            onChangeText={(t) => setState((s) => composer.edit(s, t))}
            accessibilityLabel="Comment"
          />
        </Textarea>
        {error ? <Type step="note" className="text-hotText">{error}</Type> : null}
        <Box className="flex-row items-center" style={{ gap: 10 }}>
          {imagesOn ? (
            picture ? (
              <Box className="flex-row items-center" style={{ gap: 12 }}>
                <Image source={{ uri: picture.uri }} style={THUMB} accessibilityLabel="The picture you added" />
                <Pressable onPress={() => setPicture(undefined)} accessibilityRole="button" accessibilityLabel="Remove the picture" className="justify-center" style={{ minHeight: 48 }}>
                  <Type step="row" className="text-hotText">Remove</Type>
                </Pressable>
              </Box>
            ) : (
              <Pressable onPress={() => void addPicture()} accessibilityRole="button" accessibilityLabel="Add a picture" hitSlop={6} className="flex-row items-center bg-raise border border-line rounded-pill" style={{ height: 36, paddingHorizontal: 14, gap: 6 }}>
                <Icon name="image-outline" size={16} color={colour.text} />
                <Type step="caption" className="text-text font-semibold">Add a picture</Type>
              </Pressable>
            )
          ) : null}
          <Box className="flex-1" />
          <Type step="mono" className={length > 2000 ? 'text-hotText' : 'text-text3'}>{length} / 2000</Type>
        </Box>
      </>)}
    </ActionSheet>
  );
}
