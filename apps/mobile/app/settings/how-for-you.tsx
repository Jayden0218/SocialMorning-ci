/**
 * How For You works (M12 FR-094): questions that open to show their answer.
 *
 * M17 (`SettingsHowForYou-B`): an eyebrow ("Discover › For You") over the serif title, then
 * the questions as numbered cards. The open one is a full-width card — a large serif number,
 * the question as a serif heading, the answer under it; the closed ones sit two to a row with
 * their number and question. Tapping a card opens it, tapping the open one closes it — the
 * same toggle as before, the same names.
 */
import { useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { size } from '@/design';
import { HOW_FOR_YOU } from '@/settings/how-for-you';
import { PageHeader } from '@/ui/PageHeader';
import { Eyebrow } from '@/ui/Eyebrow';

const ROW = { minHeight: size.row };
/** Two closed cards to a row; the gap between them is `gap-row` (12 pt). */
const HALF = { width: '48%' as const, minHeight: 104 };

const two = (i: number): string => String(i + 1).padStart(2, '0');

export default function HowForYou(): React.ReactElement {
  const [open, setOpen] = useState<number | undefined>(0);
  return (
    <>
    {/* M17: an empty middle, so the page draws its own eyebrow above the title. */}
    <PageHeader middle={<Box />} />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-1 pb-24">
      <Eyebrow accent>Discover › For You</Eyebrow>
      <Text className="text-text text-display font-display mt-1" numberOfLines={2} accessibilityRole="header">How For You works</Text>
      <Text className="text-muted text-meta mt-1 mb-section">What it uses, and what it never uses</Text>
      <Box className="flex-row flex-wrap justify-between gap-y-row">
        {HOW_FOR_YOU.map((item, i) => {
          const shown = open === i;
          return shown ? (
            <Pressable key={item.q} onPress={() => setOpen(undefined)} accessibilityRole="button" accessibilityState={{ expanded: true }} accessibilityLabel={item.q}
              className="w-full bg-surface border border-border rounded-row p-section" style={ROW}>
              <Text className="text-accent text-display font-display" maxFontSizeMultiplier={1.3}>{two(i)}</Text>
              <Text className="text-text text-base font-display mt-1">{item.q}</Text>
              <Text className="text-muted text-body mt-gap leading-[21px]">{item.a}</Text>
            </Pressable>
          ) : (
            <Pressable key={item.q} onPress={() => setOpen(i)} accessibilityRole="button" accessibilityState={{ expanded: false }} accessibilityLabel={item.q}
              className="bg-surface border border-border rounded-row p-section justify-between" style={HALF}>
              <Text className="text-accent text-base font-display" maxFontSizeMultiplier={1.3}>{two(i)}</Text>
              <Text className="text-text text-xs font-semibold mt-row">{item.q}</Text>
            </Pressable>
          );
        })}
      </Box>
    </ScrollView>
    </>
  );
}
