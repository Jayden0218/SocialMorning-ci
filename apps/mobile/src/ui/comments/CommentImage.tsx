// A comment's picture: a 150 × 104 thumbnail in the card, tap for the full one on black; hidden in teen mode until tapped.
/**
 * M20 US9 (spec FR-053; scenario 7). M31 W2-B (`social.html` `imgBlock`, `comments--picture-full-size`): the thumbnail is a
 * 150 × 104 box, radius 14, with a small glass tag (an image glyph) at its bottom-right corner. Tapping it opens the
 * picture on the page colour, a Stage: the picture fills the width (330 tall, 200 from the top), and the thumb zone holds a 44 close
 * circle at the bottom-left with the author's name and the comment's moment beside it. In teen mode (the "hide explicit"
 * switch, passed down as `teen` by the page) it starts as a "Tap to show" box — a picture someone posted is not checked
 * before it shows. No store import here: the comment row is drawn in tests that must not load the player.
 */
import { useContext, useState } from 'react';
import { Modal, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Image } from '@/ui/lib/image';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Avatar } from '@/ui/kit/Avatar';
import { Icon } from '@/ui/kit/Icon';
import { IconButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { mmss } from '@/ui/kit/format';
import { colour, hit } from '@/design';
import type { CommentImage as Picture } from '@/social/comment-extras-api';
import { COMMENTS, aboveInset } from './measures';

const TAP = { minHeight: hit.min };
const THUMB = { width: COMMENTS.picture.w, height: COMMENTS.picture.h, borderRadius: COMMENTS.picture.radius };
const BADGE = { position: 'absolute' as const, right: 6, bottom: 6, padding: COMMENTS.badgePad, borderRadius: COMMENTS.badgeRadius, backgroundColor: colour.glassDark };

export function CommentImage(props: { image: Picture; teen?: boolean; /** Who posted it and at which moment — shown beside Close on the full picture. */ by?: { name: string; offsetMs: number | null } }): React.ReactElement {
  const [shown, setShown] = useState(!props.teen);
  const [open, setOpen] = useState(false);
  const screen = useWindowDimensions();
  const insets = useContext(SafeAreaInsetsContext);
  if (!shown) {
    return (
      <Pressable onPress={() => setShown(true)} accessibilityRole="button" accessibilityLabel="Show the picture in this comment"
        className="self-start items-center justify-center bg-void border border-line px-section" style={[TAP, THUMB]}>
        <Type step="caption" className="text-text3 font-bold text-center">Tap to show the picture</Type>
      </Pressable>
    );
  }
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="imagebutton" accessibilityLabel="The picture in this comment. Opens it full size"
        className="self-start overflow-hidden bg-raise2" style={THUMB}>
        <Image source={{ uri: props.image.url }} style={THUMB} />
        <Box style={BADGE} accessible={false}><Icon name="image-outline" size={COMMENTS.badgeIcon} color={colour.text} /></Box>
      </Pressable>
      {open ? (
        <Modal visible transparent={false} animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
          <Box className="flex-1 bg-void" testID="picture-full-size">
            <Image source={{ uri: props.image.url }} resizeMode="contain" accessibilityLabel="The picture, full size"
              style={{ position: 'absolute', left: 0, right: 0, top: (insets?.top ?? 0) + COMMENTS.fullTop - COMMENTS.statusBar, width: screen.width, height: COMMENTS.fullHeight }} />
            <Box className="absolute flex-row items-center" style={{ left: COMMENTS.gutter, right: COMMENTS.gutter, bottom: aboveInset(insets?.bottom ?? 0, 40), gap: 12 }}>
              <IconButton icon="close" label="Close the picture" onPress={() => setOpen(false)} fill />
              {props.by ? (
                <Box className="flex-1 flex-row items-center" style={{ gap: 8 }}>
                  <Avatar size={COMMENTS.avatar} name={props.by.name} />
                  <Type step="compact" className="text-text" numberOfLines={1}>{props.by.name}</Type>
                  {props.by.offsetMs !== null ? <Box><TimestampChip text={mmss(props.by.offsetMs)} /></Box> : null}
                </Box>
              ) : null}
            </Box>
          </Box>
        </Modal>
      ) : null}
    </>
  );
}
