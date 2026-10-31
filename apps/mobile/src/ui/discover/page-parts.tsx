// Small parts the Discover group's inner pages share: where the body starts, the numbered thread, a hot-glow figure.
/**
 * M31 W5-D (T064; design-pulse2 `discover.html` academy--article, issue--screen, picks-past--screen). `bodyTop` puts a page's body where the
 * drawing starts it (58 / 64 / 70 from the top of the 50 pt status bar's phone). `NumberedThread` is the Thread of Academy's article
 * and an Issue: a 2 wide spine at x 36 (hot, violet at 60 %, the line colour), and on it rings of 36 — the page's void, a 2 hot border,
 * the number in Unbounded 700 15 hot-text — with the card 14 to their right.
 */
import type { ReactNode } from 'react';
import { Box } from '@/ui/lib/box';
import { LinearGradient } from '@/design/tailwind';
import { colour } from '@/design';
import { Type } from '@/ui/kit/Type';
import type { PushedLayout } from '@/ui/kit/PushedPage';
import { DRAWN } from '@/ui/me/lists';
import { PAGE, PAGE_TYPE } from './measures';

/** Where the body of a page drawn to start `drawn` from the top of the phone begins under this device's status bar. */
export function bodyTop(layout: Pick<PushedLayout, 'top'>, drawn: number = PAGE.body): number {
  return layout.top + (drawn - DRAWN.status);
}

const SPINE = [colour.hot, colour.violet, colour.line] as const;
const AT = [0, 0.6, 1] as const;

/** The thread: the list 18 from the left, `PAGE.threadRight` from the right, the spine behind it from `spineTop` to the foot. */
export function NumberedThread(props: { children: ReactNode; spineTop?: number; right?: number }): React.ReactElement {
  return (
    <Box testID="numbered-thread" style={{ paddingLeft: PAGE.threadLeft, paddingRight: props.right ?? PAGE.threadRight }}>
      <LinearGradient
        colors={SPINE}
        locations={AT}
        testID="numbered-spine"
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', left: PAGE.spineX, top: props.spineTop ?? 0, bottom: 0, width: 2 }}
      />
      {props.children}
    </Box>
  );
}

/** The ring on the spine: 36, the page's void inside a 2 hot border, the number in hot-text. */
export function ThreadRing(props: { n: number }): React.ReactElement {
  return (
    <Box testID="thread-ring" className="bg-void border-2 border-hot items-center justify-center" style={{ width: PAGE.ring, height: PAGE.ring, borderRadius: PAGE.ring / 2, zIndex: 2 }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Type step="lede" className="text-hotText" style={PAGE_TYPE.ring15}>{String(props.n)}</Type>
    </Box>
  );
}

/** One row of the thread: the ring, then the card. */
export function ThreadRow(props: { n: number; children: ReactNode; gap: number }): React.ReactElement {
  return (
    <Box testID="thread-row" className="flex-row" style={{ gap: PAGE.ringGap, marginBottom: props.gap }}>
      <ThreadRing n={props.n} />
      <Box className="flex-1 min-w-0">{props.children}</Box>
    </Box>
  );
}
