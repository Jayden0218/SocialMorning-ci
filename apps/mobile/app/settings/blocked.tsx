// Listeners you blocked, each with an Unblock button.
/**
 * Blocked listeners (黑名单管理, M10): everyone you blocked, each with Unblock (M6's safety layer).
 *
 * M17 T084 (`SettingsBlocked-B`): the page's name sits small in the back row; under it the count
 * as a big serif figure with "listeners blocked" and the block rule in one muted line; then a
 * two-column grid of white cards — an initials disc, the name, and the same Unblock button.
 *
 * M31 S-A (T060; design-pulse2 `settings-blocked--screen`, `--with-blocks`; Mosaic): with blocks, the count in Unbounded 64 beside "listener(s) blocked", the line,
 * then the listeners as two-column cards (radius 22, padding 14): an initials disc 48, the name, and the **Unblock** pill (40, raise-2; it asks first — `BlockButton`
 * `onTile`); an odd last card keeps its half width; "— end of list —" closes the list. Empty: the flat curve, "You have not blocked anyone" and the hint line, 200 down.
 * Blocks are kept on the phone, so the list fills at once after a block. RN has no gradient text, so the count is hot-text, not the drawing's hot-to-violet.
 */
import { Box } from '@/ui/lib/box';
import { useSafety } from '@/safety/context';
import { BlockButton } from '@/ui/social/BlockButton';
import { useStores } from '@/ui/shell/providers';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { PageEmpty } from '@/ui/me/lists';
import { avatarTone } from '@/ui/kit/Avatar';
import { Note, SetPage } from '@/ui/settings/hub-parts';
import { SET, SET_TYPE } from '@/ui/settings/hub-measures';

const DISC = 48;
/** The empty block sits 200 down the page (`blockedPage(0)`). */
const EMPTY_TOP = 200;

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  const first = words[0]?.[0] ?? '';
  const second = words.length > 1 && words[0] !== 'A' ? (words[1]?.[0] ?? '') : '';
  return (first + second).toUpperCase();
}

export default function BlockedScreen(): React.ReactElement {
  const stores = useStores();
  const { version } = useSafety();
  void version; // re-read on every block change
  const rows = stores.blocks.all().filter((b) => b.pending >= 0);
  const pairs: (typeof rows)[] = [];
  for (let i = 0; i < rows.length; i += 2) pairs.push(rows.slice(i, i + 2));
  return (
    <PushedPage title="Blocked listeners">
      {(layout) => (
        <SetPage layout={layout}>
          {rows.length === 0 ? (
            <>
              <Box style={{ height: EMPTY_TOP }} />
              <PageEmpty top={0} title="You have not blocked anyone" line="Block from a profile or the ⋯ on a comment." />
            </>
          ) : (
            <>
              <Box className="flex-row items-end" style={{ gap: SET.rowGap }}>
                <Type step="figure" className="text-hotText" style={SET_TYPE.count64} maxFontSizeMultiplier={1.3}>{String(rows.length)}</Type>
                <Type step="section" className="text-text" style={{ paddingBottom: SET.rowGap }}>{rows.length === 1 ? 'listener blocked' : 'listeners blocked'}</Type>
              </Box>
              <Note>Nothing they write, clip or do shows for you. They are not told.</Note>
              <Box style={{ gap: SET.bigGap }}>
                {pairs.map((pair) => (
                  <Box key={pair[0]?.listenerId} className="flex-row" style={{ gap: SET.bigGap }}>
                    {pair.map((item) => {
                      const name = item.displayName ?? 'A listener';
                      return (
                        <Box key={item.listenerId} testID="blocked-card" className="bg-raise items-start" style={{ flex: 1, minWidth: 0, borderRadius: SET.radius, padding: SET.bigPad, gap: SET.bigGap }}>
                          <Box className="items-center justify-center" style={{ width: DISC, height: DISC, borderRadius: DISC / 2, backgroundColor: avatarTone(name).fill }} accessible={false}>
                            <Type step="row" className={avatarTone(name).ink === 'text' ? 'text-text' : 'text-void'} accessibilityElementsHidden importantForAccessibility="no">{initialsOf(name)}</Type>
                          </Box>
                          <Type step="row" className="text-text" numberOfLines={1}>{name}</Type>
                          <BlockButton listenerId={item.listenerId} displayName={item.displayName ?? 'this listener'} onTile />
                        </Box>
                      );
                    })}
                    {pair.length === 1 ? <Box style={{ flex: 1, minWidth: 0 }} /> : null}
                  </Box>
                ))}
              </Box>
              {/* Owner, 2026-10-05: the bottom of a fetched list says so. */}
              <Type step="tag" className="text-text3 text-center" style={SET_TYPE.mono11}>— end of list —</Type>
            </>
          )}
        </SetPage>
      )}
    </PushedPage>
  );
}
