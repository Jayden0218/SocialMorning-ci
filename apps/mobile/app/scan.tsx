// Camera window to scan a QR code; asks for camera permission first.
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
 *
 * M31 W6-B (T071; design-pulse2 shell.html `scan--screen`, `scan--camera-denied`, `scan--camera-preview`): Stage. Before the camera is
 * allowed this page is Pulse's pre-prompt — it explains before the phone asks: a 240 square with four light corners round a 124
 * glowing QR tile, "Scan a QR code" (30) and the reason (15) low, and a row with Close (52 circle) and "Allow camera" (light, 52); when
 * the phone will not ask again the row is Close beside the hot-text sentence. Allowed: the camera in a 358 tall window (radius 32) with
 * hot corner marks and a hot scan line, the hint under it, and "Scan QR code" (26) over Close (quiet) and Torch (light; on → hot,
 * "Torch on"). While the permission is not known yet the page is plain void. What a first code read does is unchanged.
 */

import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { bars, colour, gutter } from '@/design';
import { scanTarget } from '@/search/scan';
import { apiBaseUrl } from '@/social/base-url';
import { PageGlow } from '@/ui/kit/PageGlow';
import { IconButton, PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { useReducedMotion } from '@/ui/kit/useReducedMotion';
import { GlowTile } from '@/ui/me/lists';
import { below } from '@/ui/paused/measures';
import { SCAN } from '@/ui/scan/measures';

const SCANNER = { barcodeTypes: ['qr' as const] };

function close(router: ReturnType<typeof useRouter>): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** One corner mark: two sides of a small square, in a colour. */
function Corner(props: { at: 'tl' | 'tr' | 'bl' | 'br'; size: number; inset?: number; radius: number; hot?: boolean }): React.ReactElement {
  const top = props.at[0] === 't';
  const left = props.at[1] === 'l';
  const o = props.inset ?? 0;
  const r = props.radius;
  return (
    <Box
      className={`absolute ${props.hot ? 'border-hot' : 'border-text'}`}
      style={{
        width: props.size, height: props.size,
        ...(top ? { top: o, borderTopWidth: SCAN.thick } : { bottom: o, borderBottomWidth: SCAN.thick }),
        ...(left ? { left: o, borderLeftWidth: SCAN.thick } : { right: o, borderRightWidth: SCAN.thick }),
        ...(top && left ? { borderTopLeftRadius: r } : {}),
        ...(top && !left ? { borderTopRightRadius: r } : {}),
        ...(!top && left ? { borderBottomLeftRadius: r } : {}),
        ...(!top && !left ? { borderBottomRightRadius: r } : {}),
        ...(props.hot ? { shadowColor: colour.hot, shadowOpacity: 1, shadowRadius: 3, shadowOffset: { width: 0, height: 0 } } : {}),
      }}
    />
  );
}

/** The scan line: glides top to bottom inside the window, and stands still under Reduce Motion. */
function ScanLine(props: { height: number }): React.ReactElement {
  const y = useRef(new Animated.Value(0)).current;
  const still = useReducedMotion(); // M31 T081: the one hook (it was a direct AccessibilityInfo read, M32 T090)
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(Animated.timing(y, { toValue: 1, duration: 2_000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [still, y]);
  const travel = props.height - SCAN.markInset * 2;
  return (
    <Animated.View
      testID="scan-line"
      className="absolute bg-hot rounded-pill"
      style={{ left: SCAN.lineInset, right: SCAN.lineInset, height: SCAN.lineThick, top: SCAN.markInset, shadowColor: colour.hot, shadowOpacity: 1, shadowRadius: SCAN.lineGlow, shadowOffset: { width: 0, height: 0 }, transform: [{ translateY: still ? travel / 2 : y.interpolate({ inputRange: [0, 1], outputRange: [0, travel] }) }] }}
    />
  );
}

export default function ScanScreen(): React.ReactElement {
  const router = useRouter();
  const [permission, ask] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const done = useRef(false);
  const { width } = useWindowDimensions();
  const side = gutter(width);

  // Before the phone says what the permission is: a plain void page, a frame, no flash.
  if (!permission) return <Box className="flex-1 bg-void" />;

  if (!permission.granted) {
    return (
      <PushedPage title="Scan a QR code" tone="none" bare onBack={null} now={false}>
        {(layout) => (
          <Box className="flex-1">
            <PageGlow top={SCAN.glowTop} strength={SCAN.glowStrength} />
            <Box
              testID="scan-frame"
              className="absolute items-center justify-center"
              style={{ left: '50%', marginLeft: -SCAN.frame / 2, top: below(layout.top, SCAN.frameTop), width: SCAN.frame, height: SCAN.frame }}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <Corner at="tl" size={SCAN.bracket} radius={SCAN.bracketRadius} /><Corner at="tr" size={SCAN.bracket} radius={SCAN.bracketRadius} />
              <Corner at="bl" size={SCAN.bracket} radius={SCAN.bracketRadius} /><Corner at="br" size={SCAN.bracket} radius={SCAN.bracketRadius} />
              <GlowTile icon="qr-code-outline" size={SCAN.tile} />
            </Box>
            <Box className="absolute" style={{ left: side, right: side, bottom: bars.pushedGap, gap: SCAN.wordsGap }}>
              <Type step="hero" className="text-text" accessibilityRole="header">Scan a QR code</Type>
              <Type step="body" className="text-text2 font-medium">SocialNet needs the camera to read a QR code. It is used only on this screen, and nothing is recorded.</Type>
              <Box className="flex-row items-center" style={{ gap: SCAN.rowGap, marginTop: SCAN.rowTop }}>
                <IconButton icon="close" label="Close" fill diameter={SCAN.button} onPress={() => close(router)} />
                {permission.canAskAgain
                  ? <PulseButton label="Allow camera" kind="light" icon="camera-outline" height={SCAN.button} className="flex-1" onPress={() => void ask()} />
                  : <Type step="note" className="text-hotText flex-1">Camera access is off. Turn it on for SocialNet in your phone's Settings.</Type>}
              </Box>
            </Box>
          </Box>
        )}
      </PushedPage>
    );
  }

  return (
    <PushedPage
      title="Scan QR code"
      size={26}
      tone="none"
      now={false}
      onBack={null}
      below={(
        <Box className="flex-row" style={{ gap: SCAN.rowGap }}>
          <PulseButton label="Close" kind="quiet" icon="close" className="flex-1" onPress={() => close(router)} />
          <PulseButton
            label={torch ? 'Torch on' : 'Torch'}
            accessibilityLabel={torch ? 'Turn the torch off' : 'Turn the torch on'}
            kind={torch ? 'hot' : 'light'}
            icon={torch ? 'flashlight' : 'flashlight-outline'}
            selected={torch}
            className="flex-1"
            onPress={() => setTorch((x) => !x)}
          />
        </Box>
      )}
      belowHeight={SCAN.torch}
    >
      {(layout) => (
        <Box className="flex-1">
          {/* The camera picture in a rounded window; it stays dark — it is the camera. */}
          <Box
            testID="scan-window"
            className="absolute overflow-hidden bg-raise"
            style={{ left: SCAN.windowSide, right: SCAN.windowSide, top: below(layout.top, SCAN.windowTop), height: SCAN.windowHeight, borderRadius: SCAN.windowRadius }}
          >
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
              <Corner at="tl" hot size={SCAN.mark} inset={SCAN.markInset} radius={SCAN.markRadius} /><Corner at="tr" hot size={SCAN.mark} inset={SCAN.markInset} radius={SCAN.markRadius} />
              <Corner at="bl" hot size={SCAN.mark} inset={SCAN.markInset} radius={SCAN.markRadius} /><Corner at="br" hot size={SCAN.mark} inset={SCAN.markInset} radius={SCAN.markRadius} />
              <ScanLine height={SCAN.windowHeight} />
            </Box>
          </Box>
          <Box className="absolute" style={{ left: side, right: side, top: below(layout.top, SCAN.hintTop), gap: SCAN.hintGap }}>
            <Type step="title" className="text-text">Point at a QR code</Type>
            <Type step="note" className="text-text2">Clip, episode and show codes open right here</Type>
          </Box>
        </Box>
      )}
    </PushedPage>
  );
}
