// The bar pinned to a page's foot: its button sits in the middle, the same space above and below.
/**
 * Owner, 2026-10-04: "Send code" sat high in the email page's white bar — 16 pt above it,
 * 34 pt below. The root layout already pads the iPhone's bottom strip once
 * (`edges={['bottom']}` in app/_layout.tsx); the bar padded it a second time. Four more bars
 * did the same or had unequal padding (feedback, delete account, account "More", wallet).
 *
 * This bar adds no safe-area inset and has one vertical padding (`py-*`), so whatever is in it
 * is centred in its colour. A page opened as a native modal is outside the root's padding and
 * pads its own bottom. Guard G-BB1: __tests__/bottom-bar.test.ts.
 */
import { Box } from '@/ui/lib/box';

const TONE = { surface: 'bg-surface', page: 'bg-background' } as const;
const LINE = { hairline: 'border-t-hairline border-separator', border: 'border-t border-border' } as const;
const PAD = { none: 'py-0', row: 'py-row', section: 'py-section' } as const;

/**
 * `tone`: white (`surface`) or the page colour. `line`: the hairline (most bars) or the card
 * border (the auth pages). `pad`: the space above and below — the same both ways. `className`
 * lays out what is inside (e.g. `flex-row gap-row`); it must not add vertical padding.
 */
export function BottomBar(props: { tone: keyof typeof TONE; line?: keyof typeof LINE; pad?: keyof typeof PAD; className?: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Box className={`${TONE[props.tone]} ${LINE[props.line ?? 'hairline']} px-screen-x ${PAD[props.pad ?? 'row']} ${props.className ?? ''}`}>
      {props.children}
    </Box>
  );
}
