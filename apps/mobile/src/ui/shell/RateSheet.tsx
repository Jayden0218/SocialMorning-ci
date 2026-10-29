// "Enjoying SocialNet?" — a bottom sheet asking for a store rating, or for feedback instead.
/**
 * Owner, 2026-10-04 (with a 小宇宙 screenshot): a sheet from the bottom on the tabs — a close X,
 * a large question, a thumbs-up, one line, then two buttons side by side: "Give feedback" (opens Send feedback) and "Rate us".
 * Our own words, not 小宇宙's (M7: copy nothing).
 *
 * M31 S-C (T062; design-pulse2 `shell.html` `rate-sheet--sheet`, `toast--rate-sheet`): the kit `ActionSheet` with no title row — the
 * close circle (36) top right; "Enjoying SocialNet?" in Unbounded 800 21 over "A rating helps a lot" in the hot-to-violet
 * gradient words, and a 60 thumbs-up disc (hot at 16 %, hot-text glyph, a hot glow) beside them; the line in Geist 500 15; then
 * Give feedback (ring, 52) and Rate us (hot, void words, 52) side by side. The toast after Rate us is the app's light toast.
 *
 * The rule (M24 fix F-P, owner 2026-10-08 "fix all" — it opened on every start on the iPhone):
 * it asks until the listener answers, and never again after ANY answer — Rate us, Give feedback,
 * the X or the backdrop all record `rate.answered`. The 2026-10-04 testing switch (`EVERY_START`)
 * is gone. Guard: __tests__/m24-fixes-fp.test.tsx.
 *
 * The app is on neither store yet (M6 J7 deferred), so "Rate" thanks the listener with a toast
 * until `STORE_URL` is filled in at release. No native review prompt (no native iOS UI).
 */
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { openSystem } from '@/ui/kit/openLink';
import { router } from 'expo-router';
import { Box } from '@/ui/lib/box';
import { bars, glow } from '@/design';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Icon } from '@/ui/kit/Icon';
import { IconButton, PulseButton } from '@/ui/kit/PulseButton';
import { mixColour } from '@/ui/kit/pulse-math';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { useCovered, useStores, useToast } from '@/ui/shell/providers';
import { AUTH, AUTH_TYPE } from '@/ui/auth/measures';
import type { SettingsStore } from '@/storage/types';
import { interestsDueFrom } from '@/discover/interests';
import type { RatePrompt } from '@socialmorning/social-core';
import { getAppConfig } from '@/config/store';

/** Set at release: the App Store page needs its numeric id; Play's is the package name. M25 A7: the admin's links win. */
export const STORE_URL: { ios?: string; android?: string } = {};
export const RATE_KEY = 'rate.answered';
/** M25 A7: when the answer was given (ms), for the admin's optional "ask again after N days". */
export const RATE_AT_KEY = 'rate.answeredAt';

/**
 * M25 A7: the rule comes from the admin's settings (`app_config` key `ratePrompt`); its default is
 * the M24 rule above — on, ask until any answer, never again. When the admin sets "ask again after
 * N days", a listener who closed the sheet or chose feedback is asked again N days later; one who
 * tapped "Rate us" never is. Off → never asks.
 */
export function shouldAskRating(s: SettingsStore, rule: RatePrompt = getAppConfig().ratePrompt, now = Date.now()): boolean {
  if (!rule.enabled) return false;
  const answer = s.get(RATE_KEY);
  if (answer === undefined) return true;
  if (answer === 'rate' || rule.reaskAfterDays === null) return false;
  const at = Number(s.get(RATE_AT_KEY));
  return Number.isFinite(at) && at > 0 && now - at >= rule.reaskAfterDays * 86_400_000;
}

/** The store page to open: the admin's link for this platform, else the built-in one (none yet). */
export const storeUrlFor = (os: string, rule: RatePrompt = getAppConfig().ratePrompt): string | undefined =>
  os === 'ios' ? rule.storeUrls.ios ?? STORE_URL.ios : rule.storeUrls.android ?? STORE_URL.android;

/**
 * Defect 1 (owner's iPhone, 2026-10-07): on the first open the sheet slid up OVER the interests
 * page. The sheet is a modal, so it covered whatever the gate pushed after it. Now any onboarding
 * moment in this launch — the terms not yet agreed, a page under `onboarding/` or `auth/` open,
 * or the interests page due (`interestsDueFrom`) — blocks the sheet for the rest of the launch.
 */
export function rateBlockedNow(a: { segment: string | undefined; consent: boolean; interestsDue: boolean }): boolean {
  return !a.consent || a.interestsDue || a.segment === 'onboarding' || a.segment === 'auth';
}

/** True when the sheet may slide up: on the tabs, allowed by the rule above, and not blocked earlier in this launch. */
export function rateMayAsk(s: SettingsStore, a: { onTabs: boolean; blockedThisLaunch: boolean }): boolean {
  return a.onTabs && !a.blockedThisLaunch && shouldAskRating(s);
}

/** Words in the hot-to-violet gradient (`.glowtext`): each character a step of it — a gradient on words needs a masked view the app does not ship. */
export function GlowWords(props: { text: string; from: string; to: string }): React.ReactElement {
  const chars = [...props.text];
  return (
    <Type step="hero" className="text-hotText" style={AUTH_TYPE.rateTitle} testID="glow-words">
      {chars.map((ch, i) => <Type key={i} step="hero" className="text-hotText" style={{ ...AUTH_TYPE.rateTitle, color: mixColour(props.from, props.to, (i + 0.5) / chars.length) }}>{ch}</Type>)}
    </Type>
  );
}

export function RateSheet(props: { onTabs: boolean; segment: string | undefined; consent: boolean }): React.ReactElement {
  const stores = useStores();
  const c = useColours();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState(false);
  // Latched: once anything of onboarding is seen in this launch, the sheet waits for the next one.
  const blocked = useRef(false);
  if (rateBlockedNow({ segment: props.segment, consent: props.consent, interestsDue: interestsDueFrom(stores.settings, Date.now()) })) blocked.current = true;
  // Never over the start-up cover (walk 2026-10-08: it slid up over the launch screen).
  const covered = useCovered();
  const may = !covered && rateMayAsk(stores.settings, { onTabs: props.onTabs, blockedThisLaunch: blocked.current });

  useEffect(() => {
    if (!may || asked) return;
    // M25 A7: how long after the tabs appear the sheet slides up (default 1.5 s).
    const t = setTimeout(() => { setOpen(true); setAsked(true); }, getAppConfig().ratePrompt.delayMs);
    return () => clearTimeout(t);
  }, [may, asked]);
  // Never over an onboarding page: a sheet already up closes (no answer is recorded).
  useEffect(() => { if (blocked.current && open) setOpen(false); }, [props.segment, open]);

  const answer = (a: 'rate' | 'feedback' | 'closed'): void => {
    setOpen(false);
    stores.settings.set(RATE_KEY, a);
    stores.settings.set(RATE_AT_KEY, String(Date.now()));
    if (a === 'feedback') router.push('/settings/feedback');
    if (a === 'rate') {
      const url = storeUrlFor(Platform.OS);
      if (url) void openSystem(url).then((ok) => { if (!ok) toast('Could not open the store.'); }, () => toast('Could not open the store.'));
      else toast('Thank you! Ratings open when SocialNet is in the store.');
    }
  };

  return (
    <ActionSheet open={open} onClose={() => answer('closed')} label="Enjoying SocialNet?">
      <Box className="flex-row justify-end" style={{ marginTop: -AUTH.rate.lift }}>
        <IconButton icon="close" label="Close" onPress={() => answer('closed')} fill size={18} diameter={bars.sheetClose} />
      </Box>
      <Box className="flex-row items-center" style={{ gap: AUTH.rate.gap }}>
        <Box className="flex-1" style={{ gap: bars.dot - 1 }}>
          <Type step="hero" className="text-text" style={AUTH_TYPE.rateTitle} accessibilityRole="header">Enjoying SocialNet?</Type>
          <GlowWords text="A rating helps a lot" from={c.hot} to={c.hotEnd} />
        </Box>
        <Box
          testID="rate-disc"
          className="bg-hotSoft items-center justify-center"
          style={{ width: AUTH.rate.disc, height: AUTH.rate.disc, borderRadius: AUTH.rate.disc / 2, shadowColor: c.hot, shadowOpacity: glow.hot.opacity, shadowRadius: glow.hot.radius, shadowOffset: { width: 0, height: 0 } }}
        >
          <Icon name="thumbs-up" size={28} color={c.hotText} />
        </Box>
      </Box>
      <Type step="body" className="text-text2 font-medium" style={AUTH_TYPE.sheetLine}>
        If you like listening here, five stars in the store help other people find us.
      </Type>
      <Box className="flex-row" style={{ gap: AUTH.box.gap, marginTop: AUTH.rate.lift }}>
        <PulseButton label="Give feedback" kind="ring" height={AUTH.rate.button} className="flex-1" onPress={() => answer('feedback')} />
        <PulseButton label="Rate us" kind="hot" height={AUTH.rate.button} className="flex-1" onPress={() => answer('rate')} />
      </Box>
    </ActionSheet>
  );
}
