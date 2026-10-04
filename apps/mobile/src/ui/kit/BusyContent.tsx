// A button's words and icons, swapped for the moving sound bars while its press runs.
/**
 * Owner, 2026-10-04: a busy button showed still text ("…", "Sending…") and the code page's
 * "Continue →" shrank to "…" when "Send again" was pressed. While `busy`, the content stays in
 * place but invisible — so the button keeps its exact size — and the app's Loader moves on top,
 * in the words' colour. With Reduce Motion on, the Loader's bars stand still.
 * Guard G-BU1: __tests__/busy-button.test.tsx.
 */
import { Box } from '@/ui/lib/box';
import { Loader } from './Loader';

/** `className` lays out the content (e.g. `flex-row items-center gap-1`). */
export function BusyContent(props: { busy: boolean; color?: string; barClassName?: string; size?: number; className?: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Box>
      <Box className={`${props.className ?? ''} ${props.busy ? 'opacity-0' : ''}`} testID={props.busy ? 'busy-hidden' : undefined}>
        {props.children}
      </Box>
      {props.busy ? (
        <Box className="absolute inset-0 items-center justify-center" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Loader size={props.size ?? 16} color={props.color} barClassName={props.barClassName} />
        </Box>
      ) : null}
    </Box>
  );
}
