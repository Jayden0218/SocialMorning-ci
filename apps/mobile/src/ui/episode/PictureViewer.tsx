// Full-screen pictures from show notes: pinch or double-tap to zoom, swipe between them, swipe down or ✕ to close.
/**
 * M22 US7 (FR-024, research R6). Built on react-native-zoom-toolkit's `Gallery` (a ResumableZoom
 * per picture): pinch and double-tap zoom up to 4×, swipe left/right for the next or previous
 * picture, swipe down (or ✕, or Android's back) to close. The pictures load from the publisher's
 * own address; nothing is copied to our server.
 *
 * "Save" downloads the picture to the app's cache, then stores it in Photos with
 * expo-media-library (`saveToLibraryAsync`, add-only permission — "Saved to Photos"). The module
 * is loaded on first use and only when the build has it (`requireOptionalNativeModule`, as in
 * src/notify/expo.ts): a build made before it was added hands the file to the share sheet instead,
 * whose "Save image" stores it on iPhone; on Android the sheet offers the gallery and file apps.
 * Saving to Photos is NOT VERIFIED on a phone.
 *
 * M31 W3-A (T040; design-pulse2 `episode--picture-viewer`, layout Stage): the page is the near-black void (the drawing's pure black is not
 * a token), the picture fitted with its alt text under it (text2, 13), and the bottom zone is ours — Close (the 44 raise circle,
 * "Close the picture"), "2 of 3" in mono between, and Save (the light pill, "Save the picture") — over a 200 tall fade. A failed
 * load reads "This picture didn't load." No native viewer chrome.
 * New-architecture support of the zoom library is NOT CONFIRMED until the cloud build and a phone.
 */
import { useState } from 'react';
import { Modal, Share, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Gallery, fitContainer, useImageResolution } from 'react-native-zoom-toolkit';
import { File, Paths } from 'expo-file-system';
import { requireOptionalNativeModule } from 'expo';
import { Image } from '@/ui/lib/image';
import { Box } from '@/ui/lib/box';
import { SafeAreaView } from '@/ui/lib/safe-area-view';
import { Fade } from '@/ui/kit/Fade';
import { IconButton, PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { useToast } from '@/ui/shell/providers';

export const VIEWER_MAX_SCALE = 4;
/** The drawing's bottom zone: the bar 40 up (6 over the inset the safe area adds), the fade 200, the alt line above the bar. */
export const VIEWER = { barBelow: 6, fade: 200, altBottom: 120 } as const;

/** One picture, fitted to the screen once its size is known; a broken one shows a plain line. */
function ViewerImage(props: { uri: string }): React.ReactElement {
  const { width, height } = useWindowDimensions();
  const { resolution, error } = useImageResolution({ uri: props.uri });
  if (error) return <Type step="body" className="text-text2">This picture didn't load.</Type>;
  if (!resolution) return <Box style={{ width, height }} />;
  const size = fitContainer(resolution.width / Math.max(1, resolution.height), { width, height });
  return <Image source={{ uri: props.uri }} style={size} resizeMode="contain" resizeMethod="resize" accessibilityIgnoresInvertColors />;
}

/** The file name for a saved picture: its own name when it has one, else `picture.jpg`. */
export function pictureFileName(uri: string, now: number): string {
  const last = uri.split('?')[0]?.split('/').pop() ?? '';
  const ext = /\.(jpe?g|png|gif|webp|heic)$/i.exec(last)?.[1]?.toLowerCase() ?? 'jpg';
  return `picture-${now}.${ext}`;
}

type MediaLibrary = typeof import('expo-media-library/legacy');
let mediaLibrary: MediaLibrary | null | undefined;
/** expo-media-library when this build has it, else null (an older build: the share sheet saves). */
function photoLibrary(): MediaLibrary | null {
  if (mediaLibrary !== undefined) return mediaLibrary;
  mediaLibrary = requireOptionalNativeModule('ExpoMediaLibrary') ? (require('expo-media-library/legacy') as MediaLibrary) : null;
  return mediaLibrary;
}

export function PictureViewer(props: { images: readonly string[]; /** Each picture's alt text, in the same order (shown under it). */ alts?: readonly string[]; index: number | undefined; onClose: () => void }): React.ReactElement | null {
  const toast = useToast();
  const [at, setAt] = useState(props.index ?? 0);
  const [saving, setSaving] = useState(false);
  const open = props.index !== undefined && props.images.length > 0;
  if (!open) return null;
  const current = props.images[Math.min(at, props.images.length - 1)] ?? props.images[0]!;
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const file = await File.downloadFileAsync(current, new File(Paths.cache, pictureFileName(current, Date.now())));
      const photos = photoLibrary();
      if (photos === null) { await Share.share({ url: file.uri }); return; }
      const allowed = await photos.requestPermissionsAsync(true, ['photo']);
      if (!allowed.granted) { toast('Allow SocialNet to add photos in Settings, then try again.'); return; }
      await photos.saveToLibraryAsync(file.uri);
      toast('Saved to Photos.');
    } catch {
      toast("Couldn't save the picture — try again when you're online.");
    } finally {
      setSaving(false);
    }
  };
  const shown = Math.min(at, props.images.length - 1);
  const alt = props.alts?.[shown]?.trim() ?? '';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={props.onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Box className="flex-1 bg-void" accessibilityViewIsModal>
          <Gallery
            data={[...props.images]}
            initialIndex={props.index}
            keyExtractor={(uri, i) => `${i}-${uri}`}
            renderItem={(uri) => <ViewerImage uri={uri} />}
            maxScale={VIEWER_MAX_SCALE}
            onIndexChange={setAt}
            onSwipe={(direction) => { if (direction === 'down') props.onClose(); }}
          />
          {/* The alt text under the picture (design-pulse2 `episode--picture-viewer`: text2, 13). */}
          {alt !== '' ? (
            <Box testID="picture-alt" pointerEvents="none" className="absolute px-screen-x" style={{ left: 0, right: 0, bottom: VIEWER.altBottom }}>
              <Type step="caption" className="text-text2" accessibilityLiveRegion="polite">{alt}</Type>
            </Box>
          ) : null}
          <Fade bottom={0} height={VIEWER.fade} />
          {/* The bottom zone: Close (the 44 circle) and Save (the light pill), the counter between them. */}
          <SafeAreaView edges={['bottom']} className="absolute left-0 right-0 bottom-0" style={{ zIndex: 20 }}>
            <Box testID="picture-bar" className="flex-row items-center px-screen-x gap-row" style={{ paddingBottom: VIEWER.barBelow }}>
              <IconButton icon="close" label="Close the picture" onPress={props.onClose} fill size={22} />
              <Type step="mono" className="flex-1 text-text2 text-center" accessibilityLiveRegion="polite">
                {props.images.length > 1 ? `${shown + 1} of ${props.images.length}` : ''}
              </Type>
              <PulseButton label="Save" accessibilityLabel="Save the picture" icon="download-outline" kind="light" busy={saving} onPress={() => void save()} />
            </Box>
          </SafeAreaView>
        </Box>
      </GestureHandlerRootView>
    </Modal>
  );
}
