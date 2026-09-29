/** How For You works (M12 FR-094): questions that open to show their answer. */
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Pressable } from '../../src/ui/lib/pressable';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { Icon } from '../../src/ui/Icon';
import { useColours } from '../../src/ui/useColours';
import { useStores } from '../../src/ui/providers';
import { size } from '../../src/design';
import { HOW_FOR_YOU } from '../../src/settings/how-for-you';

const ROW = { minHeight: size.row };

export default function HowForYou(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const [open, setOpen] = useState<number | undefined>(0);
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-row pb-24">
      <Stack.Screen options={{ title: 'How For You works' }} />
      {HOW_FOR_YOU.map((item, i) => {
        const shown = open === i;
        return (
          <Box key={item.q} className="border-b-hairline border-separator">
            <Pressable onPress={() => setOpen(shown ? undefined : i)} accessibilityRole="button" accessibilityState={{ expanded: shown }} accessibilityLabel={item.q}
              className="flex-row items-center gap-row" style={ROW}>
              <Text className="text-text text-sm font-semibold flex-1">{item.q}</Text>
              <Icon name={shown ? 'chevron-up' : 'chevron-down'} size={18} color={c.muted} />
            </Pressable>
            {shown ? <Text className="text-muted text-sm pb-section leading-[21px]">{item.a}</Text> : null}
          </Box>
        );
      })}
    </ScrollView>
  );
}
