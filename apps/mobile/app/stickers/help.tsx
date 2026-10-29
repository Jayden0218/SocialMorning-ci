// How stickers are earned: one line per sticker, where earned dates come from, and how decorating works.
/**
 * M21 US9 (T103): the help page behind the Stickers page's ?. The lines come from the same
 * catalogue the stickers are worked out from (`STICKER_RULES` in social-core, looks and words in
 * `src/me/stickers.ts`), so the page cannot promise a sticker that does not exist.
 *
 * M31 W4-A (T050; design-pulse2 social.html `stickers-help--screen`; layout pattern Panel): an intro tile (the premium tint fading to raise,
 * radius 22, padding 16, Geist 500 15/22), then under the edge label "How each one is earned" one grouped tile of rows (a 34 disc in the
 * premium tint with the mark in hot-text, the title 13/600, how it is earned 12/16 in text2, a hairline between rows), then under "Good to
 * know" three tiles of 13/19 text2. The title bar is back and "How stickers work" (26). Read-only: back is the page's only action.
 */
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { LinearGradient } from '@/design/tailwind';
import { colour } from '@/design';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { STICKER_LOOK } from '@/me/stickers';
import { PLACEMENT_MAX, STICKER_RULES } from '@socialmorning/social-core';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { DRAWN } from '@/ui/me/lists';
import { StickerDisc } from '@/ui/profile/StickerDisc';
import { PROFILE, PROFILE_TYPE } from '@/ui/profile/measures';

const INTRO_FILL = [colour.premiumTint, colour.raise] as const;
const INTRO_AT = [0, 0.7] as const;
/** The tiles are 22 round, in the Me tab's lane (28 left, 16 right), 10 apart; a group's edge label sits 10 down from its top. */
const LANE = { marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right, gap: ME_MOSAIC.gap } as const;

export default function StickerHelpScreen(): React.ReactElement {
  const rows = STICKER_RULES.filter((r) => STICKER_LOOK[r.id] !== undefined);
  const notes = [
    'Listening counts the time you actually played, once, even if you listened on two phones.',
    'The date under a sticker is the day you reached it, when we know it. Otherwise it just says Earned.',
    `Decorate my profile puts up to ${PLACEMENT_MAX} of your stickers on your profile. Drag a sticker to move it; use two fingers to resize and turn it. Everyone who opens your profile sees them, unless you hide decorations in Privacy.`,
  ];
  return (
    <PushedPage title="How stickers work" size={26}>
      {(layout) => (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: layout.top + (PROFILE.stageTop - DRAWN.status), paddingBottom: layout.reserve, gap: ME_MOSAIC.gap }}>
          <Box style={LANE}>
            <Box className="overflow-hidden" style={{ borderRadius: ME_MOSAIC.radius, padding: ME_MOSAIC.pad + 2 }}>
              <LinearGradient colors={INTRO_FILL} locations={INTRO_AT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" />
              <Type step="body" className="text-text font-medium">Stickers are given by SocialMorning for listening milestones. They are free, and you keep them.</Type>
            </Box>
          </Box>
          <Box>
            <EdgeLabel label="How each one is earned" top={ME_MOSAIC.gap} />
            <Box testID="help-rows" className="bg-raise" style={{ ...LANE, borderRadius: ME_MOSAIC.radius, paddingVertical: 6, paddingHorizontal: ME_MOSAIC.pad, gap: 0 }}>
              {rows.map((r, k) => {
                const look = STICKER_LOOK[r.id]!;
                return (
                  <Box key={r.id} className={`flex-row items-center ${k > 0 ? 'border-t border-line' : ''}`} style={{ gap: ME_MOSAIC.pad - 2, paddingVertical: PROFILE.helpRowPad }} accessible accessibilityLabel={`${look.title}: ${look.how}`}>
                    <StickerDisc icon={look.icon} size={PROFILE.helpCircle} ring={0} />
                    <Box className="flex-1">
                      <Type step="chip" className="text-text" style={PROFILE_TYPE.helpTitle}>{look.title}</Type>
                      <Type step="caption" className="text-text2" style={PROFILE_TYPE.helpLine}>{look.how}</Type>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
          <Box>
            <EdgeLabel label="Good to know" top={ME_MOSAIC.gap} />
            <Box style={LANE}>
              {notes.map((n) => (
                <Box key={n} className="bg-raise" style={{ borderRadius: ME_MOSAIC.radius, padding: ME_MOSAIC.pad }}>
                  <Type step="caption" className="text-text2" style={PROFILE_TYPE.helpNote}>{n}</Type>
                </Box>
              ))}
            </Box>
          </Box>
        </ScrollView>
      )}
    </PushedPage>
  );
}
