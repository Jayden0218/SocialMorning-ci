// The Google / Facebook sign-in buttons — drawn only for a way in that is built (none today).
/**
 * M25 L3c (App Review 2.1, security audit #22): the sign-in page showed Google and Facebook
 * buttons that only opened Coming soon. A button that does nothing is a rejection, so this row
 * draws only `readyMethods()` and renders nothing at all while none is ready.
 * Guard: __tests__/m25-store.test.tsx (break: set `ready: true` on Google in methods.ts).
 */
import { Box } from '@/ui/lib/box';
import { AuthButton } from './AuthShell';
import { OTHER_METHODS, readyMethods, type MethodInfo, type OtherMethod } from './methods';

export function OtherWays(props: { methods?: readonly MethodInfo[]; onChoose: (id: OtherMethod) => void }): React.ReactElement | null {
  const ready = readyMethods(props.methods ?? OTHER_METHODS);
  if (ready.length === 0) return null;
  return (
    <Box className="flex-row gap-row mt-row">
      {ready.map((m) => (
        <AuthButton
          key={m.id}
          outline
          mark={m.mark}
          label={m.label}
          text={m.short}
          className="flex-1 rounded-pill"
          disabled={false}
          onPress={() => props.onChoose(m.id)}
        />
      ))}
    </Box>
  );
}
