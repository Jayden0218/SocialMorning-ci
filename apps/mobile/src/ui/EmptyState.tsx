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
 */
import { Button, ButtonText } from './lib/button';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { Loader } from './Loader';
import { router } from 'expo-router';
import { emptyState, type Surface } from '@socialmorning/social-core';

/** Kept as a style: font-scale asserts the action's tap target on the button's own `style`. M9 (T033): the actions are gluestack Buttons. */
const TAP = { minHeight: 44 };
/** B's primary pill: 52 pt. */
const PILL = { minHeight: 52 };
/** The mark's tile, 72 pt. */
const TILE = { width: 72, height: 72 };
const HIDE = { accessible: false, importantForAccessibility: 'no-hide-descendants' as const };

/** Rising signal bars, the last two faint, under a slash — drawn with views, no icon font (the
 * component reads no palette: it renders outside the providers in tests). */
function NoSignal(): React.ReactElement {
  return (
    <Box {...HIDE} className="flex-row items-end gap-[3px]" style={{ height: 24 }}>
      <Box className="bg-accent rounded-pill" style={{ width: 5, height: 8 }} />
      <Box className="bg-accent rounded-pill" style={{ width: 5, height: 13 }} />
      <Box className="bg-track rounded-pill" style={{ width: 5, height: 18 }} />
      <Box className="bg-track rounded-pill" style={{ width: 5, height: 24 }} />
      <Box className="absolute bg-accent rounded-pill" style={{ width: 2.5, height: 32, left: 13, top: -4, transform: [{ rotate: '-45deg' }] }} />
    </Box>
  );
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
};

export function EmptyState(props: EmptyStateProps): React.ReactElement | null {
  const view = emptyState(props.surface, {
    offline: props.offline ?? false,
    hasCache: props.hasCache ?? false,
    ...(props.loadingMs !== undefined ? { loadingMs: props.loadingMs } : {}),
    ...(props.failed !== undefined ? { failed: props.failed } : {}),
  });
  if (view.kind === 'quiet') return null;
  const wrap = `py-4 gap-1.5 ${props.page ? 'items-center px-screen-x' : 'items-start'} ${props.className ?? ''}`;
  const align = props.page ? 'text-center' : '';
  const self = props.page ? 'self-center' : 'self-start';
  if (view.kind === 'loading') {
    return (
      <Box className={wrap} accessibilityLiveRegion="polite">
        <Loader label="Loading" />
      </Box>
    );
  }
  if (view.kind === 'offline' || view.kind === 'error') {
    // One Retry for both layouts: the page's yellow pill at the foot, or the inline link.
    const page = props.page === true;
    const retry = props.onRetry ? (
      <Button variant={page ? 'default' : 'link'} className={page ? 'w-full rounded-pill bg-primary justify-center mt-section' : `py-2.5 px-0 justify-center ${self}`} style={page ? PILL : TAP} onPress={props.onRetry} accessibilityRole="button" accessibilityLabel="Retry">
        <ButtonText className={page ? 'text-onPrimary text-[15px] font-bold' : 'text-accent text-body font-bold'}>Retry</ButtonText>
      </Button>
    ) : null;
    if (page) {
      return (
        <Box className={`flex-1 px-screen-x pb-section ${props.className ?? ''}`} accessibilityLiveRegion="polite">
          <Box className="flex-1 items-start pt-20">
            <Box className="bg-surface border border-border rounded-artwork-lg items-center justify-center" style={TILE}>
              {view.kind === 'offline' ? <NoSignal /> : <Text {...HIDE} className="text-accent font-display text-hero">!</Text>}
            </Box>
            <Text className="text-text font-display text-lg leading-[30px] mt-screen-x">{view.sentence}</Text>
          </Box>
          {retry}
        </Box>
      );
    }
    return (
      <Box className={wrap} accessibilityLiveRegion="polite">
        <Text className="text-text text-body">{view.sentence}</Text>
        {retry}
      </Box>
    );
  }
  const action = props.action ?? { label: view.action.label, onPress: () => router.push(view.action.route as never) };
  return (
    <Box className={wrap}>
      <Text className={props.page ? `text-text text-title font-display-semibold ${align}` : 'text-text text-body'}>{view.sentence}</Text>
      <Button variant="link" className={`py-2.5 px-0 justify-center ${self}`} style={TAP} onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label}>
        <ButtonText className="text-accent text-body font-bold">{action.label}</ButtonText>
      </Button>
    </Box>
  );
}
