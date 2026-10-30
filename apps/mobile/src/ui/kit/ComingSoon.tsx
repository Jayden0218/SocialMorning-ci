// A "Coming soon" sheet shown when you tap a feature not ready yet.
/**
 * M17 (FR-013, `ComingSoonWallet-B` / `ComingSoonSocialSignIn-B`): what a not-released feature
 * says when it is tapped — instead of a short toast or a control that does nothing. A bottom
 * sheet (owner, 2026-10-04: as the B designs, not a centred card): the drag handle, the
 * feature's mark on a tinted tile beside its name in capitals, "Coming soon" in the serif, one
 * sentence on what it will do, and a yellow "Got it". An optional second action goes somewhere
 * real (e.g. "Continue with email") as a bold accent text button. Never a date, never a price.
 *
 *   const [comingSoon, dialog] = useComingSoon();
 *   comingSoon({ feature: 'Google sign-in', mark: 'google', line: '…', second: { label: 'Continue with email', onPress } });
 *   return <>…{dialog}</>;
 */
import { useCallback, useState } from 'react';
import { Image } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import {
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicator,
  ActionsheetDragIndicatorWrapper,
} from '@/ui/lib/actionsheet';
import { hit } from '@/design';
import { display } from '@/ui/auth/display';
import { inkOn } from '@/ui/auth/AuthShell';
import { useStores } from '@/ui/shell/providers';
import { Eyebrow } from './Eyebrow';
import { Icon, type IconName } from './Icon';
import { useColours } from './useColours';

/** Google's own "G", from its sign-in branding kit — shown only as supplied. */
const GOOGLE_G = require('../../../assets/google-g.png');
const G = { width: 28, height: 28 };
/** The design's 56 pt mark tile, 54 pt Got it pill and 48 pt text button. */
const TILE = { width: 56, height: 56 };
const PILL = { minHeight: 54 };
const TAP = { minHeight: hit.min };

export type ComingSoonRequest = {
  /** The feature's name, shown in capitals, e.g. "Google sign-in". */
  feature: string;
  /** The feature's mark on the tile: an icon, or Google's "G". */
  mark: IconName | 'google';
  /** One sentence on what it will do. */
  line: string;
  /** A second action that goes somewhere real. */
  second?: { label: string; onPress: () => void };
};

export function ComingSoonDialog(props: { request: ComingSoonRequest | undefined; onClose: () => void }): React.ReactElement {
  const c = useColours(useStores().settings);
  const r = props.request;
  return (
    <Actionsheet isOpen={r !== undefined} onClose={props.onClose}>
      <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
      <ActionsheetContent className="px-screen-x pt-gap items-stretch" accessibilityViewIsModal>
        <ActionsheetDragIndicatorWrapper>
          <ActionsheetDragIndicator />
        </ActionsheetDragIndicatorWrapper>
        <Box className="flex-row items-center gap-row mt-row">
          <Box className="rounded-row bg-accentTint items-center justify-center" style={TILE} accessible={false}>
            {r?.mark === 'google'
              ? <Image source={GOOGLE_G} style={G} accessibilityIgnoresInvertColors />
              : r ? <Icon name={r.mark} size={28} color={c.accent} /> : null}
          </Box>
          <Eyebrow accent>{r?.feature ?? ''}</Eyebrow>
        </Box>
        <Text style={display(34, c.text, { leading: 40 })} className="text-text font-display mt-section" accessibilityRole="header">
          Coming soon
        </Text>
        <Text className="text-muted text-[15px] leading-[23px] mt-gap">{r?.line ?? ''}</Text>
        <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Got it" className="items-center justify-center rounded-pill bg-primary mt-screen-x" style={PILL}>
          <Text className="text-onPrimary text-[15px] font-extrabold" style={{ color: inkOn(c) }}>Got it</Text>
        </Pressable>
        {r?.second ? (
          <Pressable onPress={() => { const go = r.second!.onPress; props.onClose(); go(); }} accessibilityRole="button" accessibilityLabel={r.second.label} className="items-center justify-center mt-1" style={TAP}>
            <Text className="text-accent text-[15px] font-bold">{r.second.label}</Text>
          </Pressable>
        ) : null}
        <Box className="h-section" />
      </ActionsheetContent>
    </Actionsheet>
  );
}

export function useComingSoon(): [(request: ComingSoonRequest) => void, React.ReactElement] {
  const [request, setRequest] = useState<ComingSoonRequest | undefined>();
  const ask = useCallback((next: ComingSoonRequest) => setRequest(next), []);
  const dialog = <ComingSoonDialog request={request} onClose={() => setRequest(undefined)} />;
  return [ask, dialog];
}
