// What an empty, loading, offline or failed page shows, with a Retry button.
/**
 * M6 US3 (FR-019–FR-021): one component for every empty surface — a sentence on what
 * fills it and one action that leads there; a loading row after 1 s; an offline or error
 * state with Retry after 10 s. The copy lives in `packages/social-core/src/empty.ts`, so
 * the 13 surfaces are enumerable and testable. M17 (`LoadError-B`, `PlayLatest-B`): on a whole
 * page the sentence is the Editorial serif headline.
 *
 * M17 T108 (`LoadError-B`): on a whole page the offline / error state is B's — left-aligned, a
 * 72 pt white tile with a drawn mark (no signal for offline, "!" for an error), the sentence in
 * 24 pt serif, and Retry as the full-width yellow pill at the foot of the page (it was a text
 * link). Inline uses keep the short sentence and the Retry link. Same Retry, same name.
 *
 * M31 W6-C: the loading page is ghost rows (breathing) over the 12-bar loader; an inline empty or error state is a raise card
 * (radius 22, padding 16) with the link "Open player →" / "Retry" in hot text.
 *
 * M31 T022 (design-pulse2 `empty`, `states--feed-offline`): the shared empty block is a flat curve
 * (40 bars, 200 wide, 20 tall, the `line` colour), the first sentence as a title in Unbounded 18, the
 * rest as a line in text2, and one light button; the whole-page offline / error state keeps the 72
 * tile with the drawn mark and the sentence in Unbounded 24, left-aligned, with Retry as the light
 * pill at the foot. Same sentences, same actions, same names.
 */
import { Text } from '@/ui/kit/Text';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Loader } from './Loader';
import { GhostRows } from './GhostRows';
import { Curve } from './Curve';
import { PulseButton } from './PulseButton';
import { Type } from './Type';
import { ErrBlock } from '@/ui/chat/blocks';
import { router } from 'expo-router';
import { emptyState, type Surface } from '@socialmorning/social-core';
import { hit } from '@/design';

/** Kept as a style: font-scale asserts the action's tap target on the button's own `style`. */
const TAP = { minHeight: hit.min };
/** An inline empty or error state: a raise card, the sentence and a hot-text link (design-pulse2 `states--clips-empty`, `states--error-inline`). */
const CARD = 'bg-raise border border-line rounded-artwork-lg p-section gap-row items-start';
/** The mark's tile, 72 pt. */
const TILE = { width: 72, height: 72 };
const HIDE = { accessible: false, importantForAccessibility: 'no-hide-descendants' as const };
/** The flat curve of an empty block: 200 wide, 40 bars, 20 tall. */
const FLAT = { width: 200 };
const NONE: readonly number[] = [];

/** Rising signal bars, the last two faint, under a slash — drawn with views, no icon font (the
 * component reads no palette: it renders outside the providers in tests). */
function NoSignal(): React.ReactElement {
  return (
    <Box {...HIDE} className="flex-row items-end gap-hair" style={{ height: 24 }}>
      <Box className="bg-hotText rounded-pill" style={{ width: 5, height: 8 }} />
      <Box className="bg-hotText rounded-pill" style={{ width: 5, height: 13 }} />
      <Box className="bg-track rounded-pill" style={{ width: 5, height: 18 }} />
      <Box className="bg-track rounded-pill" style={{ width: 5, height: 24 }} />
      <Box className="absolute bg-hotText rounded-pill" style={{ width: 2.5, height: 32, left: 13, top: -4, transform: [{ rotate: '-45deg' }] }} />
    </Box>
  );
}

/** "No subscriptions yet. Pick something to listen to." → the first sentence, then the rest. */
export function splitSentence(sentence: string): { title: string; line: string } {
  const m = /^(.+?[.!?])\s+(\S.*)$/.exec(sentence);
  return m ? { title: m[1]!, line: m[2]! } : { title: sentence, line: '' };
}

export type EmptyStateProps = {
  surface: Surface;
  offline?: boolean;
  hasCache?: boolean;
  /** How long the first load has been running; undefined = not loading. */
  loadingMs?: number;
  failed?: boolean;
  onRetry?: () => void;
  /** Overrides the table's action (e.g. "Comment at 14:32" on the episode page). */
  action?: { label: string; onPress: () => void };
  className?: string;
  /**
   * M12 FR-056 (B9): the empty state fills a whole page — centre the sentence and its action,
   * as the picture empty states do. Inline uses (the episode page's comments) stay left.
   */
  page?: boolean;
  /**
   * M31 W4-C (design-pulse2 `social.html#notifications--feed-offline`): the offline / error state as a centred block under the page's
   * own controls — a 64 raise circle with the wifi mark, the sentence in Unbounded 18, and a light "Try again" (its spoken name stays
   * "Retry"). For a page that keeps tiles above it (Notifications keeps System and From hosts).
   */
  block?: boolean;
  /**
   * M31 D-C (design-pulse2 `profile--stats-empty`): the sentence inside a tile of a Mosaic — Geist 500 14 / 20 in text, no padding of its own
   * (the tile has it), the action kept as the hot-text link under it. Only the empty (nothing to show) state; loading, offline and error keep their looks.
   */
  tile?: boolean;
};

/**
 * The whole-page failed / offline state (design-pulse2 `states--error-page`, `states--feed-offline`): the 72 tile with its mark, the page's own sentence in Unbounded 24,
 * and Retry as the light pill at the foot. M31 F9: a page with its own sentence (Issues) uses it directly.
 */
export function PageError(props: { sentence: string; offline?: boolean; onRetry?: () => void; className?: string }): React.ReactElement {
  return (
    <Box className={`flex-1 px-screen-x pb-section ${props.className ?? ''}`} accessibilityLiveRegion="polite">
      <Box className="flex-1 items-start pt-region">
        <Box className="bg-raise border border-line rounded-artwork-lg items-center justify-center" style={TILE}>
          {props.offline ? <NoSignal /> : <Type {...HIDE} step="hero" className="text-hotText">!</Type>}
        </Box>
        <Type step="statement" className="text-text mt-screen-x">{props.sentence}</Type>
      </Box>
      {props.onRetry ? <PulseButton label="Retry" kind="light" onPress={props.onRetry} full /> : null}
    </Box>
  );
}

export function EmptyState(props: EmptyStateProps): React.ReactElement | null {
  const view = emptyState(props.surface, {
    offline: props.offline ?? false,
    hasCache: props.hasCache ?? false,
    ...(props.loadingMs !== undefined ? { loadingMs: props.loadingMs } : {}),
    ...(props.failed !== undefined ? { failed: props.failed } : {}),
  });
  if (view.kind === 'quiet') return null;
  const wrap = `py-section gap-hair ${props.page ? 'items-center px-screen-x' : 'items-start'} ${props.className ?? ''}`;
  if (view.kind === 'loading') {
    return (
      <Box className={props.page ? `px-screen-x py-section gap-block ${props.className ?? ''}` : wrap} accessibilityLiveRegion="polite">
        {props.page ? <GhostRows /> : null}
        <Loader label="Loading" className="self-start" />
      </Box>
    );
  }
  if (view.kind === 'offline' || view.kind === 'error') {
    if (props.block) {
      return (
        <ErrBlock line={view.sentence}>
          {props.onRetry ? <PulseButton label="Try again" accessibilityLabel="Retry" kind="light" onPress={props.onRetry} /> : null}
        </ErrBlock>
      );
    }
    const page = props.page === true;
    if (page) return <PageError sentence={view.sentence} offline={view.kind === 'offline'} {...(props.onRetry ? { onRetry: props.onRetry } : {})} {...(props.className ? { className: props.className } : {})} />;
    return (
      <Box className={`${CARD} ${props.className ?? ''}`} accessibilityLiveRegion="polite">
        <Type step="body" className="text-text">{view.sentence}</Type>
        {props.onRetry ? (
          <Pressable onPress={props.onRetry} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center self-start" style={TAP}>
            <Text className="text-hotText text-pulse-row font-bold">Retry</Text>
          </Pressable>
        ) : null}
      </Box>
    );
  }
  const action = props.action ?? { label: view.action.label, onPress: () => router.push(view.action.route as never) };
  if (props.page) {
    // The shared empty block: a flat curve, a title, a line, one light button.
    const { title, line } = splitSentence(view.sentence);
    return (
      <Box className={`items-center gap-row px-block ${props.className ?? ''}`}>
        <Box style={FLAT} {...HIDE}><Curve data={NONE} count={40} height={20} min={20} flat /></Box>
        <Type step="lede" className="text-text text-center">{title}</Type>
        {line ? <Type step="note" className="text-text2 text-center">{line}</Type> : null}
        <PulseButton label={action.label} kind="light" onPress={action.onPress} className="mt-hair" />
      </Box>
    );
  }
  return (
    <Box className={props.tile ? `gap-hair items-start ${props.className ?? ''}` : `${CARD} ${props.className ?? ''}`}>
      <Type step={props.tile ? 'note' : 'body'} className="text-text">{view.sentence}</Type>
      <Pressable onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label} className="justify-center self-start" style={TAP}>
        <Text className="text-hotText text-pulse-row font-bold">{props.tile ? action.label : `${action.label} →`}</Text>
      </Pressable>
    </Box>
  );
}
