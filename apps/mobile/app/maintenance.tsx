// A calm page while the server is under maintenance: when it is expected back, and your downloads still play.
/**
 * M22 US17 item 14 (T079). Opened at start-up when `/v1/health` carries `maintenance`
 * (src/ui/shell/startupExtras.ts; the server reads MAINTENANCE_UNTIL / MAINTENANCE_MESSAGE).
 * The player is untouched: a streamed episode plays until its stream fails, and downloaded
 * episodes keep playing — "Play your downloads" opens them. "Check again" asks the server once
 * more and returns to the app when maintenance is over.
 *
 * Editorial, like the error screen in app/_layout.tsx: a drawn accent waveform with a gap in it,
 * a serif title, the line in muted, the yellow pill and an outlined one.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { PageHeader } from '@/ui/kit/PageHeader';
import { apiBaseUrl } from '@/social/base-url';
import { maintenanceInfo, parseMaintenance, type Maintenance } from '@/ui/shell/startupExtras';

const WAVE = [10, 18, 28, 16, 34, 22, 12, 0, 0, 14, 30, 20, 38, 24, 14, 8];
const PILL = { minHeight: Math.max(hit.min, 52) };

/** "Expected back at 14:30" (today) or "Expected back on 8 Oct, 09:00"; empty for a bad time. */
function backLine(until: string, now: Date = new Date()): string {
  const at = new Date(until);
  if (Number.isNaN(at.getTime())) return '';
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (at.toDateString() === now.toDateString()) return `Expected back at ${time}.`;
  return `Expected back on ${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}.`;
}

export default function MaintenanceScreen(): React.ReactElement {
  const router = useRouter();
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
  return (
    <>
    <PageHeader onBack={leave} />
    <Box className="flex-1 bg-background px-screen-x pb-10">
      <Box className="flex-1 pt-section">
        <Box className="flex-row items-center gap-[5px] h-12" accessible={false} importantForAccessibility="no-hide-descendants">
          {WAVE.map((h, i) => <Box key={i} className={h > 0 ? 'bg-accent rounded' : 'rounded'} style={{ width: 8, height: h }} />)}
        </Box>
        <Text className="text-text font-display text-[40px] leading-[52px] mt-7" accessibilityRole="header">We'll be right back</Text>
        <Text className="text-muted text-title leading-[25px] mt-[14px]">{info?.message ?? 'SocialNet is being updated.'}</Text>
        {back ? <Text className="text-text text-title leading-[25px] mt-row">{back}</Text> : null}
        <Text className="text-muted text-body mt-row">Your downloaded episodes still play while we work.</Text>
      </Box>
      <Pressable onPress={() => router.replace('/downloads')} accessibilityRole="button" accessibilityLabel="Play your downloads" className="bg-primary rounded-pill px-section items-center justify-center w-full" style={PILL}>
        <Text className="text-onPrimary text-[15px] font-bold">Play your downloads</Text>
      </Pressable>
      <Pressable onPress={check} disabled={checking} accessibilityRole="button" accessibilityLabel="Check again" accessibilityState={{ busy: checking }} className="border border-border bg-surface rounded-pill px-section items-center justify-center w-full mt-gap" style={PILL}>
        <Text className="text-text text-[15px] font-bold">{checking ? 'Checking…' : 'Check again'}</Text>
      </Pressable>
    </Box>
    </>
  );
}
