/**
 * Scan a QR code (M10, owner 2026-09-27). The camera opens only here, only after the
 * listener allows it, and only reads QR codes. The first code read decides where to go
 * (`src/search/scan.ts`); anything that is not one of the app's own links goes into
 * the search box as text rather than being opened.
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Text, View } from 'react-native';
import { apiBaseUrl } from '../src/social/base-url';
import { scanTarget } from '../src/search/scan';
import { Button } from '../src/ui/Button';

const SCANNER = { barcodeTypes: ['qr' as const] };

export default function ScanScreen(): React.ReactElement {
  const router = useRouter();
  const [permission, ask] = useCameraPermissions();
  const done = useRef(false);

  if (!permission) return <View className="flex-1 bg-background" />;
  if (!permission.granted) {
    return (
      <View className="flex-1 bg-background px-screen-x justify-center gap-section">
        <Text className="text-text text-base font-bold" accessibilityRole="header">Scan a QR code</Text>
        <Text className="text-muted text-sm">SocialNet needs the camera to read a QR code. It is used only on this screen, and nothing is recorded.</Text>
        {permission.canAskAgain
          ? <Button label="Allow camera" onPress={() => void ask()} />
          : <Text className="text-muted text-sm">Camera access is off. Turn it on for SocialNet in your phone's Settings.</Text>}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
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
      <View className="absolute left-0 right-0 bottom-24 items-center" pointerEvents="none">
        <Text className="text-onPrimary bg-scrim text-sm px-section py-row rounded-pill">Point the camera at a QR code</Text>
      </View>
    </View>
  );
}
