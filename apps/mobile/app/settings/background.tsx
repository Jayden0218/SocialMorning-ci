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
 *
 * M31 S-A (T060; design-pulse2 `settings-background--screen`, drawn for iPhone and Android; Panel): iPhone — one tile 200 down the page: a moon in hot-text and the
 * line in 16 / 23. Android — the lede (14, text-2), the four steps in one tile (numbers in mono 13 hot-text, text 14 / 20), and the page's two buttons
 * **Open battery optimisation** (light) and **Open SocialNet's app settings** (quiet) in the content; if the phone cannot open a page, the fallback
 * line (12, text-2) appears under them. Title "Playing with the screen off" (Unbounded 24–26, up to two lines), back in the bottom bar.
 */
import { useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { PushedPage } from '@/ui/kit/PushedPage';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { Lede, Note, Sec, SetCard, SetPage } from '@/ui/settings/hub-parts';
import { SET, SET_TYPE } from '@/ui/settings/hub-measures';

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
/** The iPhone page leaves 200 above its one tile (`bgPage(false)`). */
const IPHONE_TOP = 200;

export default function BackgroundScreen(): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const intents = launcher();
  const open = (action: string, data?: string) => {
    if (!intents) { setFailed(true); return; }
    void intents.startActivityAsync(action, data ? { data } : undefined).catch(() => setFailed(true));
  };
  if (Platform.OS !== 'android') {
    return (
      <PushedPage title="Playing with the screen off" size={26}>
        {(layout) => (
          <SetPage layout={layout}>
            <Box style={{ height: IPHONE_TOP }} />
            <SetCard testID="iphone-card" gap={SET.rowGap}>
              <Icon name="moon-outline" size={28} color={colour.hotText} />
              <Type step="body" className="text-text font-medium" style={SET_TYPE.lead16}>On iPhone, SocialNet keeps playing with the screen off. Nothing to set.</Type>
            </SetCard>
          </SetPage>
        )}
      </PushedPage>
    );
  }
  return (
    <PushedPage title="Playing with the screen off" size={24}>
      {(layout) => (
        <SetPage layout={layout}>
          <Lede small>If an episode stops a few minutes after the screen goes off, your phone is saving battery by stopping SocialNet. You can let it keep playing.</Lede>
          <Sec label="Steps">
            <SetCard gap={SET.rowGap}>
              {STEPS.map((step, i) => (
                <Box key={step} className="flex-row" style={{ gap: SET.rowGap }}>
                  <Type step="mono" className="text-hotText" style={[SET_TYPE.mono13, { width: 16 }]}>{`${i + 1}`}</Type>
                  <Type step="note" className="text-text flex-1">{step}</Type>
                </Box>
              ))}
            </SetCard>
          </Sec>
          <PulseButton label="Open battery optimisation" onPress={() => open('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS')} full />
          <PulseButton label="Open SocialNet's app settings" kind="quiet" onPress={() => open('android.settings.APPLICATION_DETAILS_SETTINGS', `package:${PACKAGE}`)} full />
          {failed ? <Note>This phone did not open that page. Go to Settings › Apps › SocialNet › Battery instead.</Note> : null}
        </SetPage>
      )}
    </PushedPage>
  );
}
