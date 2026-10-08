// "Enjoying SocialNet?" — a bottom sheet asking for a store rating, or for feedback instead.
/**
 * Owner, 2026-10-04 (with a 小宇宙 screenshot): a sheet from the bottom on the tabs — a close X,
 * a large serif question, a thumbs-up, one line, then two buttons side by side: "Give
 * feedback" (outlined, opens Send feedback) and "Rate us" (the yellow pill). Owner, same day:
 * the title smaller (24 pt, was 30) and the button words short enough to show whole. Our own words
 * and the Editorial look, not 小宇宙's (M7: copy nothing).
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
import { Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent } from '@/ui/lib/actionsheet';
import { Icon } from '@/ui/kit/Icon';
import { useColours } from '@/ui/kit/useColours';
import { useCovered, useStores, useToast } from '@/ui/shell/providers';
import { hit } from '@/design';
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

const TAP = { minHeight: hit.min, minWidth: hit.min };
const PILL = { minHeight: 52 };

export function RateSheet(props: { onTabs: boolean; segment: string | undefined; consent: boolean }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
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
      if (url) void Linking.openURL(url).catch(() => toast('Could not open the store.'));
      else toast('Thank you! Ratings open when SocialNet is in the store.');
    }
  };

  return (
    <Actionsheet isOpen={open} onClose={() => answer('closed')}>
      <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
      <ActionsheetContent className="px-screen-x pt-gap items-stretch" accessibilityViewIsModal>
        <Box className="flex-row justify-end">
          <Pressable onPress={() => answer('closed')} accessibilityRole="button" accessibilityLabel="Close" className="items-center justify-center" style={TAP}>
            <Box className="w-8 h-8 rounded-pill bg-background border border-border items-center justify-center">
              <Icon name="close" size={18} color={c.muted} />
            </Box>
          </Pressable>
        </Box>
        <Box className="flex-row items-center gap-gap">
          <Box className="flex-1">
            <Text className="text-text font-display text-lg leading-[31px]" accessibilityRole="header">Enjoying SocialNet?</Text>
            <Text className="text-accent font-display text-lg leading-[31px]">A rating helps a lot</Text>
          </Box>
          <Box className="w-14 h-14 rounded-pill bg-accentTint items-center justify-center">
            <Icon name="thumbs-up" size={28} color={c.accent} />
          </Box>
        </Box>
        <Text className="text-muted text-[15px] leading-[22px] mt-row">
          If you like listening here, five stars in the store help other people find us.
        </Text>
        <Box className="flex-row gap-gap mt-screen-x">
          <Pressable onPress={() => answer('feedback')} accessibilityRole="button" accessibilityLabel="Give feedback" className="flex-1 items-center justify-center rounded-pill border border-border bg-surface px-2" style={PILL}>
            <Text className="text-muted text-[15px] font-bold" numberOfLines={1}>Give feedback</Text>
          </Pressable>
          <Pressable onPress={() => answer('rate')} accessibilityRole="button" accessibilityLabel="Rate us" className="flex-1 items-center justify-center rounded-pill bg-primary px-2" style={PILL}>
            <Text className="text-onPrimary text-[15px] font-bold" numberOfLines={1}>Rate us</Text>
          </Pressable>
        </Box>
        <Box className="h-section" />
      </ActionsheetContent>
    </Actionsheet>
  );
}
