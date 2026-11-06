// How stickers are earned: one line per sticker, where earned dates come from, and how decorating works.
/**
 * M21 US9 (T103): the help page behind the Stickers page's ?. The lines come from the same
 * catalogue the stickers are worked out from (`STICKER_RULES` in social-core, looks and words in
 * `src/me/stickers.ts`), so the page cannot promise a sticker that does not exist.
 *
 * Spec 039 (Detail template): a `DetailPage` (Back + "How stickers work"); the intro tile, then "How each one is earned" and "Good to know" as `Section`s on the gutter.
 *
 * M31 W4-A (T050; design-pulse2 social.html `stickers-help--screen`; layout pattern Panel): an intro tile (the premium tint fading to raise,
 * radius 22, padding 16, Geist 500 15/22), then under the heading "How each one is earned" one grouped tile of rows (a 34 disc in the
 * premium tint with the mark in hot-text, the title 13/600, how it is earned 12/16 in text2, a hairline between rows), then under "Good to
 * know" three tiles of 13/19 text2. The title bar is back and "How stickers work" (26). Read-only: back is the page's only action.
 */
import { Box } from '@/ui/lib/box';
import { LinearGradient } from '@/design/tailwind';
import { colour, radius, spacing } from '@/design';
import { DetailPage } from '@/ui/detail/DetailPage';
import { Section } from '@/ui/kit/layout';
import { Type } from '@/ui/kit/Type';
import { STICKER_LOOK } from '@/me/stickers';
import { PLACEMENT_MAX, STICKER_RULES } from '@socialmorning/social-core';
import { StickerDisc } from '@/ui/profile/StickerDisc';
import { PROFILE, PROFILE_TYPE } from '@/ui/profile/measures';

const INTRO_FILL = [colour.premiumTint, colour.raise] as const;
const INTRO_AT = [0, 0.7] as const;

export default function StickerHelpScreen(): React.ReactElement {
  const rows = STICKER_RULES.filter((r) => STICKER_LOOK[r.id] !== undefined);
  const notes = [
    'Listening counts the time you actually played, once, even if you listened on two phones.',
    'The date under a sticker is the day you reached it, when we know it. Otherwise it just says Earned.',
    `Decorate my profile puts up to ${PLACEMENT_MAX} of your stickers on your profile. Drag a sticker to move it; use two fingers to resize and turn it. Everyone who opens your profile sees them, unless you hide decorations in Privacy.`,
  ];
  return (
    <DetailPage title="How stickers work">
      <Box className="overflow-hidden" style={{ borderRadius: radius.row, padding: spacing.section }}>
              <LinearGradient colors={INTRO_FILL} locations={INTRO_AT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" />
        <Type step="body" className="text-text font-medium">Stickers are given by SocialMorning for listening milestones. They are free, and you keep them.</Type>
      </Box>
      <Section title="How each one is earned">
        <Box testID="help-rows" className="bg-raise" style={{ borderRadius: radius.row, paddingVertical: spacing.hair, paddingHorizontal: spacing.section }}>
              {rows.map((r, k) => {
                const look = STICKER_LOOK[r.id]!;
                return (
                  <Box key={r.id} className={`flex-row items-center ${k > 0 ? 'border-t border-line' : ''}`} style={{ gap: spacing.row, paddingVertical: PROFILE.helpRowPad }} accessible accessibilityLabel={`${look.title}: ${look.how}`}>
                    <StickerDisc icon={look.icon} size={PROFILE.helpCircle} ring={0} />
                    <Box className="flex-1">
                      <Type step="chip" className="text-text" style={PROFILE_TYPE.helpTitle}>{look.title}</Type>
                      <Type step="caption" className="text-text2" style={PROFILE_TYPE.helpLine}>{look.how}</Type>
                    </Box>
                  </Box>
                );
              })}
        </Box>
      </Section>
      <Section title="Good to know">
        <Box style={{ gap: spacing.row }}>
              {notes.map((n) => (
                <Box key={n} className="bg-raise" style={{ borderRadius: radius.row, padding: spacing.section }}>
                  <Type step="caption" className="text-text2" style={PROFILE_TYPE.helpNote}>{n}</Type>
                </Box>
              ))}
        </Box>
      </Section>
    </DetailPage>
  );
}
