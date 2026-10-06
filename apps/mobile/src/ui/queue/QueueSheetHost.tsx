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
  return useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => isSwipeUp(g.dx, g.dy),
    onPanResponderGrant: () => open(),
  }).panHandlers, [open]);
}
