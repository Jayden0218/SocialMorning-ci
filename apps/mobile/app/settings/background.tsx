// Playback stops when the screen is off? (Android): steps and buttons that open the phone's battery settings.
/**
 * M22 US17 item 12 (T077). Some Android phones stop background apps to save battery, which
 * stops an episode a few minutes after the screen goes off. This page explains the fix and opens
 * the right system page with expo-intent-launcher: the battery-optimisation list first, then this
 * app's own details page (where newer phones put "Battery › Unrestricted").
 *
 * Whether the app is already exempt is not readable from JS without a native call
 * (PowerManager.isIgnoringBatteryOptimizations), so the page says what to look for instead of
 * claiming a state. Asking Android directly (REQUEST_IGNORE_BATTERY_OPTIMIZATIONS) needs a
 * permission Google Play restricts, so it is not used. iPhone: not shown (no such setting).
 *
 * expo-intent-launcher is native; it is loaded lazily, and a build without it shows a line
 * pointing to Settings › Apps instead of the buttons.
 */
import { useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card, CardDivider } from '@/ui/kit/Card';
import { Button } from '@/ui/kit/Button';

type IntentLauncher = { startActivityAsync(action: string, params?: { data?: string }): Promise<unknown> };

function launcher(): IntentLauncher | null {
  try { return require('expo-intent-launcher') as IntentLauncher; } catch { return null; }
}

const PACKAGE = Constants.expoConfig?.android?.package ?? 'app.socialmorning.mobile';

const STEPS = [
  'Open the battery list below and find SocialNet.',
  'Choose "Don’t optimise", "Unrestricted" or "No restrictions" (the name depends on the phone).',
  'Some phones also have "Sleeping apps" or "Auto-launch" lists: keep SocialNet out of sleeping apps.',
  'Start an episode again and lock the screen.',
];

export default function BackgroundScreen(): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const intents = launcher();
  const open = (action: string, data?: string) => {
    if (!intents) { setFailed(true); return; }
    void intents.startActivityAsync(action, data ? { data } : undefined).catch(() => setFailed(true));
  };
  if (Platform.OS !== 'android') {
    return (
      <>
      <PageHeader title="Playing with the screen off" />
      <Box className="flex-1 bg-background px-screen-x pt-section">
        <Text className="text-muted text-body">On iPhone, SocialNet keeps playing with the screen off. Nothing to set.</Text>
      </Box>
      </>
    );
  }
  return (
    <>
    <PageHeader title="Playing with the screen off" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-2 pb-24 gap-row">
      <Text className="text-text text-body">If an episode stops a few minutes after the screen goes off, your phone is saving battery by stopping SocialNet. You can let it keep playing.</Text>
      <Card>
        {STEPS.map((step, i) => (
          <Box key={step}>
            {i > 0 ? <CardDivider /> : null}
            <Box className="flex-row gap-row py-row">
              <Text className="text-accent text-body font-bold">{`${i + 1}`}</Text>
              <Text className="text-text text-body flex-1">{step}</Text>
            </Box>
          </Box>
        ))}
      </Card>
      <Button label="Open battery optimisation" onPress={() => open('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS')} />
      <Button label="Open SocialNet's app settings" kind="secondary" onPress={() => open('android.settings.APPLICATION_DETAILS_SETTINGS', `package:${PACKAGE}`)} />
      {failed ? <Text className="text-muted text-body">This phone did not open that page. Go to Settings › Apps › SocialNet › Battery instead.</Text> : null}
    </ScrollView>
    </>
  );
}
