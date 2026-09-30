/**
 * The first step of Share (M12 FR-033/034). The episode page and the player opened the system
 * sheet with the publisher's raw .mp3 address (NEW-8, found on the iPhone). Now: share the
 * episode's SocialNet page, share this moment as a clip, or share a picture of the episode —
 * drawn by the server, downloaded here, and handed to the system sheet as a file. No audio.
 */
import { Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from './lib/actionsheet';
import { Pressable } from './lib/pressable';
import { Text } from './lib/text';
import { SheetRow } from './SheetRow';
import { hit } from '../design';
import { mmss } from './format';
import { useM12Api } from '../social/m12-api';
import { useStores, useToast } from './providers';
import { useColours } from './useColours';

const TAP = { minHeight: hit.min };

export function ShareChooser(props: {
  open: boolean;
  onClose: () => void;
  episode: { id: string; title: string; showTitle: string };
  atMs?: number;
  /** Opens the clip maker at this moment (the M4 flow). */
  onClip?: () => void;
  onShared?: () => void;
}): React.ReactElement {
  const m12 = useM12Api();
  const toast = useToast();
  const stores = useStores();
  const c = useColours(stores.settings);
  const close = (then: () => void) => { props.onClose(); then(); };

  const shareLink = async () => {
    const url = m12.episodePageUrl(props.episode.id);
    try { await Share.share({ message: `${props.episode.title} — ${props.episode.showTitle}\n${url}`, url }); props.onShared?.(); } catch { /* dismissed */ }
  };
  const shareImage = async () => {
    // Phone walk 2026-09-30: the card took 10–16 s with nothing on screen; say it is coming.
    toast('Making the picture…');
    try {
      const target = new File(Paths.cache, `share-${props.episode.id}-${Date.now()}.png`);
      const file = await File.downloadFileAsync(m12.shareCardUrl(props.episode.id, props.atMs), target);
      await Share.share({ url: file.uri, message: props.episode.title });
      props.onShared?.();
    } catch {
      toast("Couldn't make the picture — try again when you're online.");
    }
  };

  return (
    <Actionsheet isOpen={props.open} onClose={props.onClose}>
      <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
      <ActionsheetContent className="bg-background rounded-t-2xl px-screen-x pt-row pb-10 items-stretch">
        <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
        <Text className="text-sm font-bold text-text py-row">Share</Text>
        <SheetRow icon="link-outline" label="Share episode" detail="a link to its page" iconColour={c.text} onPress={() => close(() => void shareLink())} />
        {props.onClip ? (
          <SheetRow icon="cut-outline" label="Share this moment" {...(props.atMs !== undefined ? { detail: mmss(props.atMs) } : {})} iconColour={c.text} onPress={() => close(props.onClip!)} />
        ) : null}
        <SheetRow icon="image-outline" label="Share as image" iconColour={c.text} onPress={() => close(() => void shareImage())} />
        <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Cancel" className="items-center justify-center mt-row" style={TAP}>
          <Text className="text-sm text-muted">Cancel</Text>
        </Pressable>
      </ActionsheetContent>
    </Actionsheet>
  );
}
