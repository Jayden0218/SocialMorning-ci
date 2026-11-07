// Episodes and shows you marked "Not interested", each with a Restore button.
/**
 * M19 T022 (US2, FR-012): everything the listener turned down from For You, newest first —
 * the episode's or show's name (or its key when the server has no name), what kind it is, and
 * Restore, which lets it be recommended again. Opened from Settings.
 *
 * M31 S-B (T060; design-pulse2 `settings-not-interested--screen`, `--empty`, `--signed-out`, `toast--settings-not-interested`; layout Panel):
 * the hidden items are rows in one group (the kind in mono 11 hot-text caps — SHOW / EPISODE — over the name in Geist 600 15, two lines,
 * and a quiet Restore pill 36 tall at the end) under the edge label HIDDEN; the subtitle sits under the title in the bottom bar. Restore
 * removes the row at once and dims its pill while it works. Empty is the kit's block ("Nothing hidden" and the hint), signed out is one
 * tile, loading is the kit's ghost. "No more to fetch" closes a long list. Not as drawn: the list is one scroll, not a virtualised
 * list (it holds the few things one listener hid).
 */
import { useState } from 'react';
import { useDismissals } from '@/recs/dismissals';
import { useSocial } from '@/social/context';
import { Box } from '@/ui/lib/box';
import { EndOfList } from '@/ui/kit/EndOfList';
import { Type } from '@/ui/kit/Type';
import { PanelGroup } from '@/ui/me/Panel';
import { PageEmpty } from '@/ui/me/lists';
import { InfoGhost } from '@/ui/show/InfoGroup';
import { useToast } from '@/ui/shell/providers';
import { Section, SettingsPage, Tile, QuietPill } from '@/ui/settings/panel';
import { SET, SET_TYPE } from '@/ui/settings/measures';

const SUBTITLE = 'Episodes and shows For You no longer recommends.';

export default function NotInterestedScreen(): React.ReactElement {
  const { listener } = useSocial();
  const { items, loaded, restore } = useDismissals();
  const toast = useToast();
  const [busy, setBusy] = useState<string | undefined>();
  const page = (children: React.ReactNode) => <SettingsPage title="Not interested" subtitle={SUBTITLE}>{children}</SettingsPage>;
  if (!listener) return page(<Section><Tile><Type step="body" className="text-text font-medium">Sign in to see what you hid from For You.</Type></Tile></Section>);
  if (!loaded && items.length === 0) return page(<Section><InfoGhost rows={4} /></Section>);
  const back = async (kind: 'episode' | 'show', key: string) => {
    setBusy(`${kind}|${key}`);
    try { await restore(kind, key); toast('Restored'); } catch { toast("Couldn't restore — try again."); } finally { setBusy(undefined); }
  };
  if (items.length === 0) {
    return page(
      <>
        <Box style={{ height: SET.emptyTop }} />
        <Section><PageEmpty title="Nothing hidden" line="Nothing hidden. Use ⋯ on a For You row to hide it." top={0} /></Section>
      </>,
    );
  }
  return page(
    <>
      <Section label="Hidden">
        <PanelGroup>
          {items.map((item) => {
            const name = item.title ?? item.itemKey;
            const kind = item.kind === 'show' ? 'Show' : 'Episode';
            const id = `${item.kind}|${item.itemKey}`;
            return (
              <Box key={id} testID="hidden-row" className="flex-row items-center" style={{ minHeight: SET.rowMin, paddingVertical: SET.rowPadY, paddingHorizontal: SET.rowPadX, gap: SET.rowGap }}>
                <Box className="flex-1" style={{ minWidth: 0 }}>
                  <Type step="tag" className="text-hotText" style={SET_TYPE.kind}>{kind}</Type>
                  <Type step="row" className="text-text" numberOfLines={2}>{name}</Type>
                </Box>
                <QuietPill label="Restore" accessibilityLabel={`Restore ${name}`} disabled={busy === id} onPress={() => void back(item.kind, item.itemKey)} />
              </Box>
            );
          })}
        </PanelGroup>
      </Section>
      <EndOfList />
    </>,
  );
}
