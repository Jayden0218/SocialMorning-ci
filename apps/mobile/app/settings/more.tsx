// More settings: import/export shows, a link to Playback, recommendations on/off.
/**
 * More (更多功能, M10): moving your shows in or out, where one-tap Queue puts an episode,
 * and whether Discover recommends for you. The widgets and Siri's "play my latest episode"
 * (M10b US9, `src/outside/`, `app/play-latest.tsx`) have no switches, so they are not listed
 * here; CarPlay is not built (M20 Q1 = B: it needs the paid Apple program).
 *
 * M17 (`SettingsMore-B`): the rows are grouped under three serif section titles — Your shows,
 * Playback, Recommendations — each group in its own card with hairlines between rows. No
 * iPhone extras row (owner decision, FR-016). Same switches, same links, same names.
 *
 * M20 US2 (FR-005): Playback adds "Comments on lock screen" (on by default).
 *
 * M19 T070 (US7, research R3/R4): Playback adds "Music mode" (pitch correction off, so music
 * at 1.5× sounds like a faster record, not a stretched one).
 * M19 (owner approved the native patch, 2026-10-05; R3/R4 revised): "Another app's short sound"
 * — lower the volume (default) or pause — and "Skip silence" (Android cuts silences; iPhone
 * speeds them up). Both reach our expo-audio patch through the player.
 *
 * M21 US10 (T110): every Playback row moved to its own page, `settings/playback.tsx` (same
 * switches, same prefs); the Playback card here is now one row that opens it.
 *
 * M31 S-A (T060; design-pulse2 `settings-more--screen`; Panel): three groups under the edge labels YOUR SHOWS · PLAYBACK · FOR YOU instead of heading rows. Your shows: Import or export
 * subscriptions (the OPML line). Playback: Playback with its summary line. **Personalised recommendations** is the large switch tile (on = the tinted wash with a hot ring), its full line kept —
 * "Off: no For You, and nothing is sent for it." — with How For You works and Not interested as rows in one group tile under it. Title "More" with back at the bottom.
 */
import { useState } from 'react';
import { Link } from 'expo-router';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { getPref, setPref } from '@/settings/prefs';
import { useStores } from '@/ui/shell/providers';
import { Icon } from '@/ui/kit/Icon';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Toggle } from '@/ui/kit/Toggle';
import { Type } from '@/ui/kit/Type';
import { PanelGroup } from '@/ui/me/Panel';
import { Note, Sec, SetCard, SetPage, SetRow } from '@/ui/settings/hub-parts';
import { SET, SET_TYPE } from '@/ui/settings/hub-measures';

export default function MoreSettings(): React.ReactElement {
  const stores = useStores();
  const [recs, setRecs] = useState(() => getPref(stores.settings, 'personalRecs'));
  return (
    <PushedPage title="More">
      {(layout) => (
        <SetPage layout={layout}>
          <Sec label="Your shows">
            <PanelGroup>
              <Link href="/settings/opml" asChild accessibilityLabel="Import or export subscriptions"><SetRow icon="repeat-outline" label="Import or export subscriptions" line="OPML — the file every podcast app reads" /></Link>
            </PanelGroup>
          </Sec>
          {/* M21 US10 (T110): the playback switches moved to their own page. */}
          <Sec label="Playback">
            <PanelGroup>
              <Link href="/settings/playback" asChild accessibilityLabel="Playback"><SetRow icon="play" label="Playback" line="Queue, mobile data, transcript, lock screen, music mode, skip silence" /></Link>
            </PanelGroup>
          </Sec>
          <Sec label="For You">
            <Box style={{ gap: SET.tileGap }}>
              <SetCard testID="recs-card" wash={recs} gap={SET.gap}>
                <Box className="flex-row justify-between items-center">
                  <Icon name="sparkles-outline" size={SET.bigIcon} color={colour.hotText} />
                  <Toggle value={recs} onChange={(v) => { setRecs(v); setPref(stores.settings, 'personalRecs', v); }} label="Personalised recommendations" />
                </Box>
                <Type step="lede" className="text-text font-bold" style={SET_TYPE.display17}>Personalised recommendations</Type>
                <Note>For You on Discover, from what you follow and play. Off: no For You, and nothing is sent for it.</Note>
              </SetCard>
              <PanelGroup>
                {/* M12 FR-094 */}
                <Link href="/settings/how-for-you" asChild accessibilityLabel="How For You works"><SetRow icon="information-circle-outline" label="How For You works" line="What it uses, and what it never uses" /></Link>
                {/* M19 T022 (moved here from Settings in M24 US20): what For You no longer recommends, each with Restore. */}
                <Link href="/settings/not-interested" asChild accessibilityLabel="Not interested"><SetRow icon="eye-off-outline" label="Not interested" line="Episodes and shows hidden from For You" /></Link>
              </PanelGroup>
            </Box>
          </Sec>
        </SetPage>
      )}
    </PushedPage>
  );
}
