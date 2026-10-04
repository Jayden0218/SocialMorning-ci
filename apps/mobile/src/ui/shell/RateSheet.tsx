// "Enjoying SocialNet?" — a bottom sheet asking for a store rating, or for feedback instead.
/**
 * Owner, 2026-10-04 (with a 小宇宙 screenshot): a sheet from the bottom on the tabs — a close X,
 * a large serif question, a thumbs-up, one line, then two buttons side by side: "Give
 * feedback" (outlined, opens Send feedback) and "Rate us" (the yellow pill). Owner, same day:
 * the title smaller (24 pt, was 30) and the button words short enough to show whole. Our own words
 * and the Editorial look, not 小宇宙's (M7: copy nothing).
 *
 * TESTING (owner's pick, 2026-10-04): it shows on every app start, once the terms are agreed.
 * Set `EVERY_START` to false for the real rule: once, and never again after any answer.
 *
 * The app is on neither store yet (M6 J7 deferred), so "Rate" thanks the listener with a toast
 * until `STORE_URL` is filled in at release. No native review prompt (no native iOS UI).
 */
import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent } from '@/ui/lib/actionsheet';
import { Icon } from '@/ui/kit/Icon';
import { useColours } from '@/ui/kit/useColours';
import { useStores, useToast } from '@/ui/shell/providers';
import { hit } from '@/design';
import type { SettingsStore } from '@/storage/types';

/** Testing: ask on every start. False = ask once, never after an answer. */
export const EVERY_START = true;
/** Set at release: the App Store page needs its numeric id; Play's is the package name. */
export const STORE_URL: { ios?: string; android?: string } = {};
export const RATE_KEY = 'rate.answered';
/** How long after the tabs appear the sheet slides up. */
const DELAY_MS = 1500;

export function shouldAskRating(s: SettingsStore): boolean {
  return EVERY_START || s.get(RATE_KEY) === undefined;
}

const TAP = { minHeight: hit.min, minWidth: hit.min };
const PILL = { minHeight: 52 };

export function RateSheet(props: { ready: boolean }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    if (!props.ready || asked || !shouldAskRating(stores.settings)) return;
    const t = setTimeout(() => { setOpen(true); setAsked(true); }, DELAY_MS);
    return () => clearTimeout(t);
  }, [props.ready, asked, stores.settings]);

  const answer = (a: 'rate' | 'feedback' | 'closed'): void => {
    setOpen(false);
    stores.settings.set(RATE_KEY, a);
    if (a === 'feedback') router.push('/settings/feedback');
    if (a === 'rate') {
      const url = Platform.OS === 'ios' ? STORE_URL.ios : STORE_URL.android;
      if (url) void Linking.openURL(url).catch(() => toast('Could not open the store.'));
      else toast('Thank you! Ratings open when SocialNet is in the store.');
    }
  };

  return (
    <Actionsheet isOpen={open} onClose={() => answer('closed')}>
      <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
      <ActionsheetContent className="bg-surface rounded-t-artwork-lg px-screen-x pt-gap items-stretch" accessibilityViewIsModal>
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
