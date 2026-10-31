// The sheet that asks before streaming on mobile data: Allow this time, or Always allow.
/**
 * M22 US17 item 2 (T073): with "Allow mobile data for playback" off, a stream on mobile data no
 * longer just refuses — it asks. "Allow this time" lets streams through until the app is closed
 * and starts the episode; "Always allow" turns the switch on (Settings › Playback) and starts it;
 * Not now leaves it as before. The player's `mayStream` (src/ui/shell/providers.tsx) calls
 * `askMobileData`; the sheet is mounted once at the root (app/_layout.tsx).
 *
 * M31 T024 (design-pulse2 `shell.html#data-prompt--sheet`): the kit `ActionSheet` — a wifi mark,
 * "Play on mobile data?" in Unbounded 28, the line in text2, then Allow this time (light, 52), Always
 * allow (ring, 52) and Not now (hot-text; 48, not the drawn 44, so it clears the touch floor). Same names and handlers; the scrim also means Not now.
 */
import { useEffect, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { hit } from '@/design';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { setPref } from '@/settings/prefs';
import { allowMobileThisSession } from '@/settings/playback';
import { useStores } from '@/ui/shell/providers';
import { drawnType } from '@/design/type-px';

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
  const c = useColours();
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
    <ActionSheet open={ask !== undefined} onClose={close} label="Play on mobile data?">
      <Icon name="wifi" size={30} color={c.hotText} />
      <Type step="title" className="text-text" style={drawnType.prompt} accessibilityRole="header">Play on mobile data?</Type>
      <Type step="body" className="text-text2">This episode is not downloaded. Streaming it uses your mobile data.</Type>
      <Pressable onPress={once} accessibilityRole="button" accessibilityLabel="Allow this time" className="items-center justify-center rounded-pill bg-text" style={PILL}>
        <Type step="row" className="text-void">Allow this time</Type>
      </Pressable>
      <Pressable onPress={always} accessibilityRole="button" accessibilityLabel="Always allow" className="items-center justify-center rounded-pill border-outline" style={{ ...PILL, borderWidth: 1.5 }}>
        <Type step="row" className="text-text">Always allow</Type>
      </Pressable>
      <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Not now" className="items-center justify-center" style={{ minHeight: hit.min }}>
        <Type step="row" className="text-hotText">Not now</Type>
      </Pressable>
    </ActionSheet>
  );
}
