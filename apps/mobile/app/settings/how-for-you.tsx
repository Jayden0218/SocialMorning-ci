// Questions and answers about how For You recommendations work.
/**
 * How For You works (M12 FR-094): questions that open to show their answer.
 *
 * M17 (`SettingsHowForYou-B`): an eyebrow ("Discover › For You") over the serif title, then
 * the questions as numbered cards. The open one is a full-width card — a large serif number,
 * the question as a serif heading, the answer under it; the closed ones sit two to a row with
 * their number and question. Tapping a card opens it, tapping the open one closes it — the
 * same toggle as before, the same names.
 *
 * M31 S-A (T060; design-pulse2 `settings-how-for-you--screen`; Mosaic): the six questions as numbered tiles. Closed = half width (104 at least, radius 22): the number in mono 20
 * text-3, the question 14 / 600. The open one spans both columns, tinted with a hot ring: the number in Unbounded 34, the question in Unbounded 17, the answer 14 / 21. The first is open on
 * arrival (as before); a tap opens a tile and closes the other. The eyebrow "Discover › For You" sits above the title in the bottom zone, with the subtitle under it. No edge lane
 * (16 on each side). RN has no gradient text, so the number is hot-text.
 */
import { useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { HOW_FOR_YOU } from '@/settings/how-for-you';
import { drawnType } from '@/design/type-px';
import { settingsColour } from '@/design/tokens';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { SetPage } from '@/ui/settings/hub-parts';
import { SET, SET_TYPE } from '@/ui/settings/hub-measures';

const two = (i: number): string => String(i + 1).padStart(2, '0');
/** The eyebrow is one mono line (22 line + the title bar's 8) above the title. */
const EYEBROW_ABOVE = 30;

export default function HowForYou(): React.ReactElement {
  const [open, setOpen] = useState<number | undefined>(0);
  const eyebrow = <Type step="mono" className="text-hotText" style={drawnType.trackMono}>{'Discover › For You'.toUpperCase()}</Type>;
  return (
    <PushedPage title="How For You works" subtitle="What it uses, and what it never uses" size={28} extra={eyebrow} extraAbove={EYEBROW_ABOVE}>
      {(layout) => (
        <SetPage layout={layout} lane={false}>
          <Box className="flex-row flex-wrap justify-between" style={{ rowGap: SET.bigGap }}>
            {HOW_FOR_YOU.map((item, i) => {
              const shown = open === i;
              return shown ? (
                <Pressable key={item.q} onPress={() => setOpen(undefined)} accessibilityRole="button" accessibilityState={{ expanded: true }} accessibilityLabel={item.q}
                  testID="how-open" style={{ width: '100%', borderRadius: SET.radius, padding: SET.tilePad, gap: SET.gap, backgroundColor: settingsColour.wash, borderWidth: 1, borderColor: settingsColour.ring }}>
                  <Type step="figure" className="text-hotText" style={SET_TYPE.number34} maxFontSizeMultiplier={1.3}>{two(i)}</Type>
                  <Type step="lede" className="text-text font-bold" style={SET_TYPE.display17}>{item.q}</Type>
                  <Type step="body" className="text-text2" style={SET_TYPE.note14}>{item.a}</Type>
                </Pressable>
              ) : (
                <Pressable key={item.q} onPress={() => setOpen(i)} accessibilityRole="button" accessibilityState={{ expanded: false }} accessibilityLabel={item.q}
                  testID="how-closed" className="bg-raise justify-between" style={{ width: '48.5%', minHeight: 104, borderRadius: SET.radius, padding: SET.bigPad }}>
                  <Type step="mono" className="text-text3" style={SET_TYPE.mono20} maxFontSizeMultiplier={1.3}>{two(i)}</Type>
                  <Type step="compact" className="text-text" style={{ marginTop: SET.rowGap }}>{item.q}</Type>
                </Pressable>
              );
            })}
          </Box>
        </SetPage>
      )}
    </PushedPage>
  );
}
