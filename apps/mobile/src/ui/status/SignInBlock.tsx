// "Sign in to …": a lock in a raise circle, the sentence in Unbounded, and a light Sign in button.
/**
 * M31 W4-B (design-pulse2 `signIn(line, btn)`, `status--signed-out`, `status-text--signed-out`): a 64 raise circle with a lock, the sentence
 * in Unbounded 700 18 (the `lede` step), centred, and a light 200 wide "Sign in" 4 below it. It opens the sign-in page. The old pages said the
 * sentence and nothing else; the button is the drawing's.
 */
import { router } from 'expo-router';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { SIGN_IN } from './measures';

export function SignInBlock(props: { line: string }): React.ReactElement {
  return (
    <Box testID="status-sign-in" className="items-center" style={{ gap: SIGN_IN.gap, paddingHorizontal: SIGN_IN.pad }}>
      <Box className="bg-raise rounded-pill items-center justify-center" style={{ width: SIGN_IN.circle, height: SIGN_IN.circle }} accessible={false} importantForAccessibility="no-hide-descendants">
        <Icon name="lock-closed-outline" size={26} color={colour.text} />
      </Box>
      <Type step="lede" className="text-text text-center">{props.line}</Type>
      <Box style={{ marginTop: SIGN_IN.buttonUp, minWidth: SIGN_IN.button }}><PulseButton label="Sign in" kind="light" full onPress={() => router.push('/auth/sign-in')} /></Box>
    </Box>
  );
}
