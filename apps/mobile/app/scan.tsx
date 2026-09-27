/**
 * Scan a QR code (M10, owner 2026-09-27). The camera opens only here, only after the
 * listener allows it, and only reads QR codes. The first code read decides where to go
 * (`src/search/scan.ts`); anything that is not one of the app's own links goes into
 * the search box as text rather than being opened.
 *
 * Redrawn the same day ("the qrcode scanner is ugly"): the camera fills the screen, dimmed
 * outside a square window with accent corner marks and a moving scan line; a close button
 * and title on top, a hint under the window, a torch button at the bottom.
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, SafeAreaView, Text, View, useWindowDimensions } from 'react-native';
import { colour, hit } from '../src/design';
import { apiBaseUrl } from '../src/social/base-url';
import { scanTarget } from '../src/search/scan';
import { Button } from '../src/ui/Button';
import { Icon } from '../src/ui/Icon';

const SCANNER = { barcodeTypes: ['qr' as const] };
const TAP = { minWidth: hit.min, minHeight: hit.min };
const CORNER = 28;
const LINE = 4;

function close(router: ReturnType<typeof useRouter>): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** One corner mark: two sides of a small square, in the accent. */
function Corner(props: { at: 'tl' | 'tr' | 'bl' | 'br' }): React.ReactElement {
  const top = props.at[0] === 't';
  const left = props.at[1] === 'l';
  return (
    <View
      className="absolute border-accent"
      style={{
        width: CORNER, height: CORNER,
        ...(top ? { top: 0, borderTopWidth: LINE } : { bottom: 0, borderBottomWidth: LINE }),
        ...(left ? { left: 0, borderLeftWidth: LINE } : { right: 0, borderRightWidth: LINE }),
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
      className="absolute left-3 right-3 h-0.5 rounded-pill bg-accent"
      style={{ top: 8, transform: [{ translateY: still ? travel / 2 : y.interpolate({ inputRange: [0, 1], outputRange: [0, travel] }) }] }}
    />
  );
}

export default function ScanScreen(): React.ReactElement {
  const router = useRouter();
  const [permission, ask] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const done = useRef(false);
  const { width } = useWindowDimensions();
  const size = Math.min(280, Math.round(width * 0.7));

  if (!permission) return <View className="flex-1 bg-background" />;
  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-row justify-end px-row">
          <Pressable onPress={() => close(router)} accessibilityRole="button" accessibilityLabel="Close" className="items-center justify-center" style={TAP}>
            <Icon name="close" size={26} color={colour.muted} />
          </Pressable>
        </View>
        <View className="flex-1 px-screen-x items-center justify-center gap-section">
          <View className="w-28 h-28 rounded-pill bg-surface items-center justify-center">
            <Icon name="qr-code-outline" size={48} color={colour.text} />
          </View>
          <Text className="text-text text-lg font-bold text-center" accessibilityRole="header">Scan a QR code</Text>
          <Text className="text-muted text-sm text-center">SocialNet needs the camera to read a QR code. It is used only on this screen, and nothing is recorded.</Text>
          {permission.canAskAgain
            ? <Button label="Allow camera" onPress={() => void ask()} className="self-stretch" />
            : <Text className="text-muted text-sm text-center">Camera access is off. Turn it on for SocialNet in your phone's Settings.</Text>}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-text">
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
      {/* The dimmed frame around the window: four panels, so the window itself stays clear. */}
      <View className="absolute inset-0" pointerEvents="box-none">
        <View className="flex-1 bg-scrim" />
        <View className="flex-row" style={{ height: size }}>
          <View className="flex-1 bg-scrim" />
          <View style={{ width: size, height: size }} accessible accessibilityLabel="Point the camera at a QR code">
            <Corner at="tl" /><Corner at="tr" /><Corner at="bl" /><Corner at="br" />
            <ScanLine size={size} />
          </View>
          <View className="flex-1 bg-scrim" />
        </View>
        <View className="flex-1 bg-scrim items-center pt-section gap-2">
          <Text className="text-onPrimary text-sm font-semibold">Point at a QR code</Text>
          <Text className="text-onPrimary text-xs opacity-80">Clip, episode and show codes open right here</Text>
        </View>
      </View>
      <SafeAreaView className="absolute left-0 right-0 top-0">
        <View className="flex-row items-center px-row">
          <Pressable onPress={() => close(router)} accessibilityRole="button" accessibilityLabel="Close" className="items-center justify-center" style={TAP}>
            <Icon name="close" size={28} color={colour.onPrimary} />
          </Pressable>
          <Text className="flex-1 text-center text-onPrimary text-base font-bold" accessibilityRole="header">Scan QR code</Text>
          <View style={TAP} />
        </View>
      </SafeAreaView>
      <SafeAreaView className="absolute left-0 right-0 bottom-0 items-center">
        <Pressable
          onPress={() => setTorch((t) => !t)}
          accessibilityRole="button"
          accessibilityLabel={torch ? 'Turn the torch off' : 'Turn the torch on'}
          accessibilityState={{ selected: torch }}
          className={`w-14 h-14 rounded-pill items-center justify-center mb-section ${torch ? 'bg-onPrimary' : 'bg-scrim'}`}
          style={TAP}
        >
          <Icon name="flashlight-outline" size={24} color={torch ? colour.text : colour.onPrimary} />
        </Pressable>
      </SafeAreaView>
    </View>
  );
}
