/**
 * Scan a QR code (M10, owner 2026-09-27). The camera opens only here, only after the
 * listener allows it, and only reads QR codes. The first code read decides where to go
 * (`src/search/scan.ts`); anything that is not one of the app's own links goes into
 * the search box as text rather than being opened.
 *
 * Redrawn the same day ("the qrcode scanner is ugly"): the camera fills the screen, dimmed
 * outside a square window with accent corner marks and a moving scan line; a close button
 * and title on top, a hint under the window, a torch button at the bottom.
 *
 * M17 T076 + T109 (`Scan-B`, `ScanPermission-B`): the Editorial page. The camera is no longer
 * full screen: the page is the warm paper with a large serif "Scan QR code", the camera picture
 * in a rounded window (it stays dark — it is a camera picture) with yellow corner marks and a
 * yellow scan line, the hint under it (serif line + muted line), and Close and Torch as two pills
 * at the bottom. Camera not allowed: the close button top right, the QR mark as a yellow tile
 * inside corner brackets, the serif title and reason left-aligned, Allow camera at the bottom.
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, useWindowDimensions } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { SafeAreaView } from '@/ui/lib/safe-area-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit, spacing } from '@/design';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { apiBaseUrl } from '@/social/base-url';
import { scanTarget } from '@/search/scan';
import { Button } from '@/ui/kit/Button';
import { Icon } from '@/ui/kit/Icon';

const SCANNER = { barcodeTypes: ['qr' as const] };
const TAP = { minWidth: hit.min, minHeight: hit.min };
const CORNER = 28;
const LINE = 4;

function close(router: ReturnType<typeof useRouter>): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** One corner mark: two sides of a small square — yellow on the camera, dark on the page. */
function Corner(props: { at: 'tl' | 'tr' | 'bl' | 'br'; inset?: number; dark?: boolean; size?: number }): React.ReactElement {
  const top = props.at[0] === 't';
  const left = props.at[1] === 'l';
  const o = props.inset ?? 0;
  const side = props.size ?? CORNER;
  return (
    <Box
      className={`absolute ${props.dark ? 'border-text' : 'border-primary'}`}
      style={{
        width: side, height: side,
        ...(top ? { top: o, borderTopWidth: LINE } : { bottom: o, borderBottomWidth: LINE }),
        ...(left ? { left: o, borderLeftWidth: LINE } : { right: o, borderRightWidth: LINE }),
        ...(top && left ? { borderTopLeftRadius: 10 } : {}),
        ...(top && !left ? { borderTopRightRadius: 10 } : {}),
        ...(!top && left ? { borderBottomLeftRadius: 10 } : {}),
        ...(!top && !left ? { borderBottomRightRadius: 10 } : {}),
      }}
    />
  );
}

/** The scan line: glides top to bottom inside the window, and stands still under Reduce Motion. */
function ScanLine(props: { size: number }): React.ReactElement {
  const y = useRef(new Animated.Value(0)).current;
  const [still, setStill] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(Animated.timing(y, { toValue: 1, duration: 2_000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [still, y]);
  const travel = props.size - 16;
  return (
    <Animated.View
      className="absolute left-6 right-6 h-0.5 rounded-pill bg-primary"
      style={{ top: 8, transform: [{ translateY: still ? travel / 2 : y.interpolate({ inputRange: [0, 1], outputRange: [0, travel] }) }] }}
    />
  );
}


/** `Scan-B`: the corner marks sit a little inside the window's rounded edge. */
const MARK_INSET = 18;
const MARK = 30;
/** `ScanPermission-B`: the bracketed square around the QR tile. */
const FRAME = { width: 220, height: 220 };
const TILE = { width: 120, height: 120 };

export default function ScanScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const router = useRouter();
  const [permission, ask] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const done = useRef(false);
  const { width } = useWindowDimensions();
  const size = Math.min(420, width - spacing.screenX * 2);

  if (!permission) return <Box className="flex-1 bg-background" />;
  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <Box className="flex-row justify-end px-row">
          <Pressable onPress={() => close(router)} accessibilityRole="button" accessibilityLabel="Close" className="items-center justify-center" style={TAP}>
            <Icon name="close" size={26} color={c.muted} />
          </Pressable>
        </Box>
        <Box className="flex-1 px-screen-x gap-section">
          <Box className="self-center items-center justify-center mt-section mb-section" style={FRAME} accessible={false} importantForAccessibility="no-hide-descendants">
            <Corner at="tl" dark size={44} /><Corner at="tr" dark size={44} /><Corner at="bl" dark size={44} /><Corner at="br" dark size={44} />
            <Box className="rounded-artwork-lg bg-primary items-center justify-center" style={TILE}>
              <Icon name="qr-code-outline" size={56} color={c.onPrimary} />
            </Box>
          </Box>
          <Text className="text-text text-display font-display" accessibilityRole="header">Scan a QR code</Text>
          <Text className="text-muted text-body">SocialNet needs the camera to read a QR code. It is used only on this screen, and nothing is recorded.</Text>
        </Box>
        <Box className="px-screen-x pb-section">
          {permission.canAskAgain
            ? <Button label="Allow camera" onPress={() => void ask()} className="self-stretch" />
            : <Text className="text-muted text-body text-center">Camera access is off. Turn it on for SocialNet in your phone's Settings.</Text>}
        </Box>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <Box className="flex-1 px-screen-x pt-section gap-section">
        <Text className="text-text text-display font-display" accessibilityRole="header">Scan QR code</Text>
        {/* The camera picture in a rounded window; it stays dark — it is the camera. */}
        <Box className="rounded-artwork-lg overflow-hidden bg-text" style={{ width: size, height: size }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={SCANNER}
            onBarcodeScanned={({ data }) => {
              if (done.current) return;
              done.current = true;
              const t = scanTarget(data, apiBaseUrl());
              if (t.kind === 'route') router.replace(t.path as never);
              else if (t.kind === 'show') router.replace({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(t.feedUrl) } });
              else router.replace({ pathname: '/search', params: { q: t.term } });
            }}
          />
          <Box className="absolute inset-0" pointerEvents="none" accessible accessibilityLabel="Point the camera at a QR code">
            <Corner at="tl" inset={MARK_INSET} size={MARK} /><Corner at="tr" inset={MARK_INSET} size={MARK} />
            <Corner at="bl" inset={MARK_INSET} size={MARK} /><Corner at="br" inset={MARK_INSET} size={MARK} />
            <ScanLine size={size} />
          </Box>
        </Box>
        <Box className="gap-1">
          <Text className="text-text text-base font-display">Point at a QR code</Text>
          <Text className="text-muted text-meta">Clip, episode and show codes open right here</Text>
        </Box>
      </Box>
      <Box className="flex-row gap-row px-screen-x pb-section">
        <Pressable onPress={() => close(router)} accessibilityRole="button" accessibilityLabel="Close" className="flex-1 flex-row items-center justify-center gap-2 rounded-pill bg-surface border border-border" style={TAP}>
          <Icon name="close" size={20} color={c.text} />
          <Text className="text-text text-body font-bold">Close</Text>
        </Pressable>
        <Pressable
          onPress={() => setTorch((t) => !t)}
          accessibilityRole="button"
          accessibilityLabel={torch ? 'Turn the torch off' : 'Turn the torch on'}
          accessibilityState={{ selected: torch }}
          className={`flex-1 flex-row items-center justify-center gap-2 rounded-pill ${torch ? 'bg-primary' : 'bg-text'}`}
          style={TAP}
        >
          <Icon name={torch ? 'flashlight' : 'flashlight-outline'} size={20} color={torch ? c.onPrimary : c.background} />
          <Text className={torch ? 'text-onPrimary text-body font-bold' : 'text-background text-body font-bold'}>{torch ? 'Torch on' : 'Torch'}</Text>
        </Pressable>
      </Box>
    </SafeAreaView>
  );
}
