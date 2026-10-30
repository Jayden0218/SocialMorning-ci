// The sheet that asks before streaming on mobile data: Allow this time, or Always allow.
/**
 * M22 US17 item 2 (T073): with "Allow mobile data for playback" off, a stream on mobile data no
 * longer just refuses — it asks. "Allow this time" lets streams through until the app is closed
 * and starts the episode; "Always allow" turns the switch on (Settings › Playback) and starts it;
 * Not now leaves it as before. The player's `mayStream` (src/ui/shell/providers.tsx) calls
 * `askMobileData`; the sheet is mounted once at the root (app/_layout.tsx).
 *
 * The look is the confirm sheet's (src/ui/kit/confirm.tsx): warm page colour, a serif title,
 * the yellow pill, then the outlined pill and a text button.
 */
import { useEffect, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { hit } from '@/design';
import { setPref } from '@/settings/prefs';
import { allowMobileThisSession } from '@/settings/playback';
import { useStores } from '@/ui/shell/providers';

const TAP = { minHeight: hit.min };
const PILL = { minHeight: 52 };

/** What the prompt does after an allow: start the episode that was refused (when known). */
export type DataAsk = { retry?: () => void };

let listener: ((ask: DataAsk) => void) | undefined;

/** Opens the prompt. False when no prompt is mounted (the caller keeps its old notice). */
export function askMobileData(ask: DataAsk): boolean {
  if (listener === undefined) return false;
  listener(ask);
  return true;
}

export function DataPrompt(): React.ReactElement {
  const stores = useStores();
  const [ask, setAsk] = useState<DataAsk | undefined>(undefined);
  useEffect(() => {
    const l = (a: DataAsk) => setAsk(a);
    listener = l;
    return () => { if (listener === l) listener = undefined; };
  }, []);
  const close = () => setAsk(undefined);
  const once = () => { const a = ask; close(); allowMobileThisSession(); a?.retry?.(); };
  const always = () => { const a = ask; close(); setPref(stores.settings, 'mobilePlayback', true); a?.retry?.(); };
  return (
    <Actionsheet isOpen={ask !== undefined} onClose={close}>
      <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
      <ActionsheetContent className="bg-background rounded-t-artwork-lg px-screen-x pt-gap items-stretch" accessibilityViewIsModal>
        <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
        <Text className="text-text font-display text-[30px] leading-[39px] mt-row" accessibilityRole="header">Play on mobile data?</Text>
        <Text className="text-muted text-[15px] leading-[22px] mt-gap">This episode is not downloaded. Streaming it uses your mobile data.</Text>
        <Pressable onPress={once} accessibilityRole="button" accessibilityLabel="Allow this time" className="items-center justify-center rounded-pill bg-primary mt-screen-x" style={PILL}>
          <Text className="text-onPrimary text-[15px] font-bold">Allow this time</Text>
        </Pressable>
        <Pressable onPress={always} accessibilityRole="button" accessibilityLabel="Always allow" className="items-center justify-center rounded-pill border border-border bg-surface mt-gap" style={PILL}>
          <Text className="text-text text-[15px] font-bold">Always allow</Text>
        </Pressable>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Not now" className="items-center justify-center mt-1 mb-gap" style={TAP}>
          <Text className="text-accent text-body font-bold">Not now</Text>
        </Pressable>
      </ActionsheetContent>
    </Actionsheet>
  );
}
