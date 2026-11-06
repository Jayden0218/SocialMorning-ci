// A calm page while the server is under maintenance: when it is expected back, and your downloads still play.
/**
 * M22 US17 item 14 (T079). Opened at start-up when `/v1/health` carries `maintenance`
 * (src/ui/shell/startupExtras.ts; the server reads MAINTENANCE_UNTIL / MAINTENANCE_MESSAGE).
 * The player is untouched: a streamed episode plays until its stream fails, and downloaded
 * episodes keep playing — "Play your downloads" opens them. "Check again" asks the server once
 * more and returns to the app when maintenance is over.
 *
 * Spec 039 (Detail template): a `DetailPage` (Back = leave, "Maintenance"); the stopped curve with its marks, the words, and the two buttons are one column on the gutter
 * (they were pinned to the screen's top and foot). The page pads its own home strip (it is outside the root's padding). The glow and the 52 back circle in the button row are gone
 * (Back is in the title row).
 *
 * M31 W6-B (T071; design-pulse2 shell.html `maintenance--screen`): Stage. The reaction curve stopped — 40 bars, 150 tall, hot to
 * violet with a glow and a flat gap at 17-22 — with the mono marks LIVE · PAUSED · BACK 14:30 under it; the words low ("We'll be
 * right back" Unbounded 34, the server's message 16, "Expected back at …" 16, the downloads line 14); at the very bottom "Play your
 * downloads" (light, 52) and under it a row with a 52 back circle and "Check again" (ring, 52). No tab bar and no now bar here.
 * "Checking…" replaces the ring pill's words while the server is asked. Every action is as before.
 */
import { useContext, useState } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Box } from '@/ui/lib/box';
import { spacing } from '@/design';
import { GapCurve } from '@/ui/kit/GapCurve';
import { PulseButton } from '@/ui/kit/PulseButton';
import { DetailPage } from '@/ui/detail/DetailPage';
import { Type } from '@/ui/kit/Type';
import { apiBaseUrl } from '@/social/base-url';
import { maintenanceInfo, parseMaintenance, type Maintenance } from '@/ui/shell/startupExtras';
import { MAINTENANCE, pausedType } from '@/ui/paused/measures';

const pad2 = (n: number): string => String(n).padStart(2, '0');
/** 24-hour "14:30" whatever the phone's region (maintenance--screen: "BACK 14:30"). */
function clock(at: Date): string { return `${pad2(at.getHours())}:${pad2(at.getMinutes())}`; }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "Expected back at 14:30" (today) or "Expected back on 8 Oct, 09:00"; empty for a bad time. */
function backLine(until: string, now: Date = new Date()): string {
  const at = new Date(until);
  if (Number.isNaN(at.getTime())) return '';
  const time = clock(at);
  if (at.toDateString() === now.toDateString()) return `Expected back at ${time}.`;
  return `Expected back on ${at.getDate()} ${MONTHS[at.getMonth()]}, ${time}.`;
}

/** The mono mark under the curve: "BACK 14:30", empty when no time is known. */
function backMark(until: string): string {
  const at = new Date(until);
  return Number.isNaN(at.getTime()) ? '' : `BACK ${clock(at)}`;
}

export default function MaintenanceScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useContext(SafeAreaInsetsContext);
  const [info, setInfo] = useState<Maintenance | undefined>(() => maintenanceInfo());
  const [checking, setChecking] = useState(false);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const check = () => {
    setChecking(true);
    void fetch(`${apiBaseUrl()}/v1/health`)
      .then((r) => r.json())
      .then((body: unknown) => {
        const next = parseMaintenance(body);
        setInfo(next);
        if (next === undefined) leave();
      })
      .catch(() => undefined)
      .finally(() => setChecking(false));
  };
  const back = info ? backLine(info.until) : '';
  const mark = info ? backMark(info.until) : '';
  return (
    <DetailPage title="Maintenance" onBack={leave} safeBottom={insets?.bottom ?? 0} now={false}>
      <Box testID="maintenance-page" style={{ gap: spacing.block }}>
        <Box accessible={false} importantForAccessibility="no-hide-descendants" style={{ gap: spacing.gap }}>
          <GapCurve count={MAINTENANCE.curveCount} height={MAINTENANCE.curveHeight} gapFrom={MAINTENANCE.gapFrom} gapTo={MAINTENANCE.gapTo} />
          <Box className="flex-row justify-between">
            <Type step="tag" className="text-text3">LIVE</Type>
            <Type step="tag" className="text-hotText">PAUSED</Type>
            {mark ? <Type step="tag" className="text-text3">{mark}</Type> : null}
          </Box>
        </Box>
        <Box style={{ gap: MAINTENANCE.wordsGap }}>
          <Type step="figure" className="text-text" accessibilityRole="header">We’ll be right back</Type>
          <Type step="body" className="text-text2 font-medium" style={pausedType.line16}>{info?.message ?? 'SocialNet is being updated.'}</Type>
          {back ? <Type step="body" className="text-text font-medium" style={pausedType.line16}>{back}</Type> : null}
          <Type step="note" className="text-text2">Your downloaded episodes still play while we work.</Type>
        </Box>
        <Box style={{ gap: MAINTENANCE.buttonsGap }}>
          <PulseButton label="Play your downloads" kind="light" icon="download-outline" height={MAINTENANCE.button} full onPress={() => router.replace('/downloads')} />
          <PulseButton
            label={checking ? 'Checking…' : 'Check again'}
            accessibilityLabel="Check again"
            kind="ring"
            height={MAINTENANCE.button}
            full
            disabled={checking}
            onPress={check}
          />
        </Box>
      </Box>
    </DetailPage>
  );
}
