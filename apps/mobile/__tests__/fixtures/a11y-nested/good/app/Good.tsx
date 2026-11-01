// @ts-nocheck
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Type } from '@/ui/kit/Type';
// Fixture for the a11y audit: the strip's text is accessible, the button is its sibling, not inside it.
export default function Good(): React.ReactElement {
  return (
    <Box testID="strip">
      <Box accessible accessibilityLabel="Email: a@b.c">
        <Type step="mono">a@b.c</Type>
      </Box>
      <Pressable onPress={() => undefined} accessibilityRole="button" accessibilityLabel="Change email">
        <Type step="row">Change</Type>
      </Pressable>
      <Box accessible={false}>
        <Pressable onPress={() => undefined} accessibilityLabel="Fine"><Type step="row">Fine</Type></Pressable>
      </Box>
    </Box>
  );
}
