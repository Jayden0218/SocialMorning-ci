// A calm page while the server is under maintenance: when it is expected back, and your downloads still play.
/**
 * M22 US17 item 14 (T079). Opened at start-up when `/v1/health` carries `maintenance`
 * (src/ui/shell/startupExtras.ts; the server reads MAINTENANCE_UNTIL / MAINTENANCE_MESSAGE).
 * The player is untouched: a streamed episode plays until its stream fails, and downloaded
 * episodes keep playing — "Play your downloads" opens them. "Check again" asks the server once
 * more and returns to the app when maintenance is over.
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
import { useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { bars, gutter } from '@/design';
import { GapCurve } from '@/ui/kit/GapCurve';
import { PageGlow } from '@/ui/kit/PageGlow';
import { IconButton, PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { apiBaseUrl } from '@/social/base-url';
import { maintenanceInfo, parseMaintenance, type Maintenance } from '@/ui/shell/startupExtras';
import { MAINTENANCE, below, pausedType } from '@/ui/paused/measures';

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
  const { width } = useWindowDimensions();
  const side = gutter(width);
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
  const top = insets?.top ?? 0;
  // The root layout pads the home strip; the drawn 40 from the edge is that strip plus 6.
  const foot = bars.pushedGap;
  return (
    <Box className="flex-1 bg-void" testID="maintenance-page">
      <PageGlow top={MAINTENANCE.glowTop} strength={MAINTENANCE.glowStrength} />
      <Box className="absolute" style={{ left: side, right: side, top: below(top, MAINTENANCE.curveTop) }} accessible={false} importantForAccessibility="no-hide-descendants">
        <GapCurve count={MAINTENANCE.curveCount} height={MAINTENANCE.curveHeight} gapFrom={MAINTENANCE.gapFrom} gapTo={MAINTENANCE.gapTo} />
      </Box>
      <Box className="absolute flex-row justify-between" style={{ left: side, right: side, top: below(top, MAINTENANCE.marksTop) }} accessible={false} importantForAccessibility="no-hide-descendants">
        <Type step="tag" className="text-text3">LIVE</Type>
        <Type step="tag" className="text-hotText">PAUSED</Type>
        {mark ? <Type step="tag" className="text-text3">{mark}</Type> : null}
      </Box>
      <Box className="absolute" style={{ left: side, right: side, bottom: foot + MAINTENANCE.wordsBottom - MAINTENANCE.buttonsBottom, gap: MAINTENANCE.wordsGap }}>
        <Type step="figure" className="text-text" accessibilityRole="header">We’ll be right back</Type>
        <Type step="body" className="text-text2 font-medium" style={pausedType.line16}>{info?.message ?? 'SocialNet is being updated.'}</Type>
        {back ? <Type step="body" className="text-text font-medium" style={pausedType.line16}>{back}</Type> : null}
        <Type step="note" className="text-text2">Your downloaded episodes still play while we work.</Type>
      </Box>
      <Box className="absolute" style={{ left: side, right: side, bottom: foot, gap: MAINTENANCE.buttonsGap }}>
        <PulseButton label="Play your downloads" kind="light" icon="download-outline" height={MAINTENANCE.button} full onPress={() => router.replace('/downloads')} />
        <Box className="flex-row items-center" style={{ gap: MAINTENANCE.buttonsGap }}>
          <IconButton icon="chevron-back" label="Back" fill diameter={MAINTENANCE.button} onPress={leave} />
          <PulseButton
            label={checking ? 'Checking…' : 'Check again'}
            accessibilityLabel="Check again"
            kind="ring"
            height={MAINTENANCE.button}
            className="flex-1"
            disabled={checking}
            onPress={check}
          />
        </Box>
      </Box>
    </Box>
  );
}
