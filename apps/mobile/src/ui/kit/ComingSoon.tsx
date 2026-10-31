// A "Coming soon" sheet shown when you tap a feature not ready yet.
/**
 * M17 (FR-013, `ComingSoonWallet-B` / `ComingSoonSocialSignIn-B`): what a not-released feature
 * says when it is tapped — instead of a short toast or a control that does nothing. Never a date, never a price.
 *
 *   const [comingSoon, dialog] = useComingSoon();
 *   comingSoon({ feature: 'Google sign-in', mark: 'google', line: '…', second: { label: 'Continue with email', onPress } });
 *   return <>…{dialog}</>;
 *
 * M31 S-C (T062; design-pulse2 `shell.html` `coming-soon--wallet-sheet`): the kit `ActionSheet` with no title row — a 56 tile
 * (radius 18, hot at 16 %) with the feature's mark in hot-text beside its name in hot-text mono capitals, "Coming soon" in
 * Unbounded 800 34, one sentence in Geist 500 15 on 22 in text-2, "Got it" as the light pill (54) and an optional second action as
 * a hot-text 700 button (44 drawn, 48 to touch) that closes the sheet and goes somewhere real (e.g. "Open Wallet"). The scrim
 * and a drag down close it.
 */
import { useCallback, useState } from 'react';
import { Image } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { AUTH, AUTH_TYPE } from '@/ui/auth/measures';
import { ActionSheet } from './ActionSheet';
import { Icon, type IconName } from './Icon';
import { PulseButton } from './PulseButton';
import { Type } from './Type';
import { useColours } from './useColours';

/** Google's own "G", from its sign-in branding kit — shown only as supplied. */
const GOOGLE_G = require('../../../assets/google-g.png');
const G = { width: 28, height: 28 };
const SECOND = { minHeight: hit.min };

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
  const c = useColours();
  const r = props.request;
  return (
    <ActionSheet open={r !== undefined} onClose={props.onClose} label={r ? `Coming soon: ${r.feature}` : 'Coming soon'}>
      <Box className="flex-row items-center" style={{ gap: AUTH.rate.gap }}>
        <Box className="bg-hotSoft items-center justify-center" style={{ width: AUTH.soon.tile, height: AUTH.soon.tile, borderRadius: AUTH.soon.tileRadius }} accessible={false}>
          {r?.mark === 'google'
            ? <Image source={GOOGLE_G} style={G} accessibilityIgnoresInvertColors />
            : r ? <Icon name={r.mark} size={28} color={c.hotText} /> : null}
        </Box>
        <Type step="mono" className="text-hotText" style={AUTH_TYPE.fieldLabel}>{r?.feature ?? ''}</Type>
      </Box>
      <Type step="hero" className="text-text" style={AUTH_TYPE.comingSoon} accessibilityRole="header">Coming soon</Type>
      <Type step="body" className="text-text2 font-medium" style={AUTH_TYPE.sheetLine}>{r?.line ?? ''}</Type>
      <PulseButton label="Got it" kind="light" height={AUTH.soon.got} full onPress={props.onClose} />
      {r?.second ? (
        <Pressable onPress={() => { const go = r.second!.onPress; props.onClose(); go(); }} accessibilityRole="button" accessibilityLabel={r.second.label} className="items-center justify-center" style={SECOND}>
          <Type step="row" className="text-hotText font-bold">{r.second.label}</Type>
        </Pressable>
      ) : null}
    </ActionSheet>
  );
}

export function useComingSoon(): [(request: ComingSoonRequest) => void, React.ReactElement] {
  const [request, setRequest] = useState<ComingSoonRequest | undefined>();
  const ask = useCallback((next: ComingSoonRequest) => setRequest(next), []);
  const dialog = <ComingSoonDialog request={request} onClose={() => setRequest(undefined)} />;
  return [ask, dialog];
}
