// Holds the one playlist sheet at the root, so the mini player and the player open the same one.
/**
 * M21 T046 (FR-020): one playlist sheet for the whole app. The mini player's ≡, the player's
 * Playlist button and a swipe up on the player's lower controls all call `useQueueSheet().open()`;
 * the sheet itself is drawn once, here, over every page (mounted in app/_layout.tsx inside the
 * data providers, so its rows can read the stores).
 *
 * It replaces two copies: the player drew its own QueueSheet and the mini player opened the
 * `/queue` page instead (that page stays, for links that name it).
 */
import { createContext, useContext, useMemo, useState } from 'react';
import { PanResponder, type GestureResponderHandlers } from 'react-native';
import { QueueSheet } from './QueueSheet';

export type QueueSheetControl = { open: () => void; close: () => void };

const QueueSheetContext = createContext<QueueSheetControl | undefined>(undefined);

export function QueueSheetHost(props: { children?: React.ReactNode }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const control = useMemo<QueueSheetControl>(() => ({ open: () => setOpen(true), close: () => setOpen(false) }), []);
  return (
    <QueueSheetContext.Provider value={control}>
      {props.children}
      <QueueSheet open={open} onClose={control.close} />
    </QueueSheetContext.Provider>
  );
}

export function useQueueSheet(): QueueSheetControl {
  const control = useContext(QueueSheetContext);
  if (control === undefined) throw new Error('useQueueSheet must be used inside <QueueSheetHost>');
  return control;
}

/** A drag that has started upward: 5 pt up, more up than sideways. Claimed, but not yet decided. */
export function startsSwipeUp(dx: number, dy: number): boolean {
  return dy < -5 && Math.abs(dy) > Math.abs(dx);
}

/** Spec US3 scenario 1: a swipe up — at least 20 pt up, and more up than sideways. */
export function isSwipeUp(dx: number, dy: number): boolean {
  return dy < -20 && Math.abs(dy) > Math.abs(dx);
}

/**
 * The player's swipe up: spread these handlers on a view, and a swipe up across it opens the
 * sheet. Taps on the buttons inside stay taps — the swipe is claimed only once the finger has
 * moved up (the bubbling "move" question, asked after the button already holds the touch).
 */
export function useSwipeUpToOpen(): GestureResponderHandlers {
  const { open } = useQueueSheet();
  // M21 (iPhone walk 2026-10-07, Debug + Metro log): a quick flick sends only one or two moves
  // (−6, −10 pt) before the finger lifts, so deciding on a move at 20 pt missed it. The drag is
  // claimed (capture phase, before the buttons) once it starts upward, and decided on release.
  return useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_e, g) => startsSwipeUp(g.dx, g.dy),
    onMoveShouldSetPanResponder: (_e, g) => startsSwipeUp(g.dx, g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_e, g) => { if (isSwipeUp(g.dx, g.dy)) open(); },
  }).panHandlers, [open]);
}
