// @ts-nocheck
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Type } from '@/ui/kit/Type';
// Fixture for the a11y audit: a button inside an accessible strip (iOS hides the button from VoiceOver).
export default function Bad(): React.ReactElement {
  return (
    <Box testID="strip" accessible accessibilityLabel="Email: a@b.c">
      <Type step="mono">a@b.c</Type>
      <Pressable onPress={() => undefined} accessibilityRole="button" accessibilityLabel="Change email">
        <Type step="row">Change</Type>
      </Pressable>
    </Box>
  );
}
