// A comment's picture: a small one in the row, tap for the full one; hidden in teen mode until tapped.
/**
 * M20 US9 (spec FR-053; scenario 7). The thumbnail keeps the picture's shape, at most 200 pt wide
 * and 200 pt tall. Tapping it opens the full picture in a sheet with Close. In teen mode (the
 * "hide explicit" switch) it starts as a "Tap to show" box — a picture someone posted is not
 * checked before it shows.
 */
import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent } from '@/ui/lib/actionsheet';
import { Image } from '@/ui/lib/image';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { getPref } from '@/settings/prefs';
import { useStores } from '@/ui/shell/providers';
import type { CommentImage as Picture } from '@/social/comment-extras-api';
import { thumbSize } from '@/social/image-fit';

const THUMB = 200;
const TAP = { minHeight: hit.min };

export function CommentImage(props: { image: Picture }): React.ReactElement {
  const stores = useStores();
  const teen = getPref(stores.settings, 'hideExplicit');
  const [shown, setShown] = useState(!teen);
  const [open, setOpen] = useState(false);
  const screen = useWindowDimensions();
  const thumb = thumbSize(props.image.w, props.image.h, THUMB, hit.min);
  if (!shown) {
    return (
      <Pressable onPress={() => setShown(true)} accessibilityRole="button" accessibilityLabel="Show the picture in this comment"
        className="self-start items-center justify-center rounded-row border border-border bg-background px-section" style={[TAP, { width: thumb.width, height: thumb.height }]}>
        <Text className="text-muted text-xs font-bold text-center">Tap to show the picture</Text>
      </Pressable>
    );
  }
  const full = thumbSize(props.image.w, props.image.h, Math.min(screen.width, screen.height) - 32, hit.min);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="imagebutton" accessibilityLabel="The picture in this comment. Opens it full size"
        className="self-start rounded-row overflow-hidden border border-border">
        <Image source={{ uri: props.image.url }} style={thumb} />
      </Pressable>
      {open ? (
        <Actionsheet isOpen onClose={() => setOpen(false)}>
          <ActionsheetBackdrop />
          <ActionsheetContent className="bg-surface items-center gap-row pb-section">
            <Image source={{ uri: props.image.url }} style={full} accessibilityLabel="The picture, full size" />
            <Box className="w-full items-center">
              <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close the picture" className="justify-center px-section rounded-pill border border-border" style={TAP}>
                <Text className="text-text text-body font-bold">Close</Text>
              </Pressable>
            </Box>
          </ActionsheetContent>
        </Actionsheet>
      ) : null}
    </>
  );
}
