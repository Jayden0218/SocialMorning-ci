// The Google / Facebook sign-in buttons — drawn only for a way in that is built (none today).
/**
 * M25 L3c (App Review 2.1, security audit #22): the sign-in page showed Google and Facebook
 * buttons that only opened Coming soon. A button that does nothing is a rejection, so this row
 * draws only `readyMethods()` and renders nothing at all while none is ready.
 * M31 S-C (T061; design-pulse2 `auth-sign-in--screen`): "when ready they sit as ring pills under the email button" — 56 tall,
 * side by side, 14 under it like every part of the bottom zone (the zone's gap does the spacing).
 * Guard: __tests__/m25-store.test.tsx (break: set `ready: true` on Google in methods.ts).
 */
import { Box } from '@/ui/lib/box';
import { AuthButton } from './AuthShell';
import { AUTH } from './measures';
import { OTHER_METHODS, readyMethods, type MethodInfo, type OtherMethod } from './methods';

export function OtherWays(props: { methods?: readonly MethodInfo[]; onChoose: (id: OtherMethod) => void }): React.ReactElement | null {
  const ready = readyMethods(props.methods ?? OTHER_METHODS);
  if (ready.length === 0) return null;
  return (
    <Box className="flex-row" style={{ gap: AUTH.box.gap }}>
      {ready.map((m) => (
        <AuthButton
          key={m.id}
          outline
          mark={m.mark}
          label={m.label}
          text={m.short}
          className="flex-1"
          disabled={false}
          onPress={() => props.onChoose(m.id)}
        />
      ))}
    </Box>
  );
}
