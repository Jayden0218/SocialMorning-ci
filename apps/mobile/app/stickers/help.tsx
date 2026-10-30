// How stickers are earned: one line per sticker, where earned dates come from, and how decorating works.
/**
 * M21 US9 (T103): the help page behind the Stickers page's ?. The lines come from the same
 * catalogue the stickers are worked out from (`STICKER_RULES` in social-core, looks and words in
 * `src/me/stickers.ts`), so the page cannot promise a sticker that does not exist.
 */
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Icon } from '@/ui/kit/Icon';
import { useColours } from '@/ui/kit/useColours';
import { PageHeader } from '@/ui/kit/PageHeader';
import { STICKER_LOOK } from '@/me/stickers';
import { PLACEMENT_MAX, STICKER_RULES } from '@socialmorning/social-core';

export default function StickerHelpScreen(): React.ReactElement {
  const c = useColours();
  return (
    <>
    <PageHeader title="How stickers work" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-gap pb-24 gap-section">
      <Text className="text-text text-body">Stickers are given by SocialMorning for listening milestones. They are free, and you keep them.</Text>
      <Box>
        <Text className="text-text text-base font-display mb-1" accessibilityRole="header">How each one is earned</Text>
        {STICKER_RULES.map((r) => {
          const look = STICKER_LOOK[r.id];
          if (!look) return null;
          return (
            <Box key={r.id} className="flex-row items-center gap-row py-row border-b-hairline border-separator" accessible accessibilityLabel={`${look.title}: ${look.how}`}>
              <Box className="w-10 h-10 rounded-pill bg-primary items-center justify-center"><Icon name={look.icon} size={20} color={c.onPrimary} /></Box>
              <Box className="flex-1 gap-0.5">
                <Text className="text-text text-meta font-semibold">{look.title}</Text>
                <Text className="text-muted text-sm">{look.how}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box className="gap-gap">
        <Text className="text-text text-base font-display" accessibilityRole="header">Good to know</Text>
        <Text className="text-muted text-body">Listening counts the time you actually played, once, even if you listened on two phones.</Text>
        <Text className="text-muted text-body">The date under a sticker is the day you reached it, when we know it. Otherwise it just says Earned.</Text>
        <Text className="text-muted text-body">{`Decorate my profile puts up to ${PLACEMENT_MAX} of your stickers on your profile. Drag a sticker to move it; use two fingers to resize and turn it. Everyone who opens your profile sees them, unless you hide decorations in Privacy.`}</Text>
      </Box>
    </ScrollView>
    </>
  );
}
