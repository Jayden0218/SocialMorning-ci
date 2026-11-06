// The Feed template of spec 039: a stream of items as cards under design B's title row (Back, title, actions).
/**
 * Spec 039 P3b (Feed lane, `design/B-Notifications.dc.html`). `FeedPage` is `PageList` with what every pushed Feed page repeats: a Back circle
 * before the title (`onBack` to replace it, `null` for none), the page's `actions` as circles after it, the now bar's flag from the toast
 * placement's rule, and `safeBottom` 0 (the root layout pads the home strip once, guard G-T1). `FeedScroll` is the same for a page that is a
 * few blocks and not a list (`Page`). A day or a group is a small caps heading over its cards (`Day`, `DayHeading` in
 * `@/ui/notifications/cards`); a failed load is an `InlineNotice`; nothing yet is an `EmptyBlock`; signed out is a `SignInBlock`.
 */
import { useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Box } from '@/ui/lib/box';
import { spacing } from '@/design';
import { goBack } from '@/ui/kit/PageHeader';
import { IconButton, PulseButton } from '@/ui/kit/PulseButton';
import type { TitleAction } from '@/ui/kit/TitleBar';
import { Page, PageList } from '@/ui/kit/layout';
import type { PageListProps } from '@/ui/kit/layout/PageList';
import { GhostRows } from '@/ui/comments/Spine';
import { Type } from '@/ui/kit/Type';
import { usePlayerSelector, selectIdle } from '@/playback/store';
import { useToastPlacement } from '@/ui/shell/toastPlacement';

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

type Frame = {
  /** Replaces Back's action; `null` draws no Back. */
  onBack?: (() => void) | null;
  backLabel?: string;
  /** Circles after the title (at most two). */
  actions?: readonly TitleAction[];
  /** Replaces the circles. */
  right?: React.ReactNode;
};

function useFrame(props: Frame & { leading?: React.ReactNode; trailing?: React.ReactNode }): { leading: React.ReactNode; trailing: React.ReactNode } {
  const onBack = props.onBack === undefined ? goBack : props.onBack ?? undefined;
  const actions = (props.actions ?? []).slice(0, 2);
  return {
    leading: props.leading ?? (onBack ? <IconButton icon="chevron-back" label={props.backLabel ?? 'Back'} onPress={onBack} fill size={22} /> : undefined),
    trailing: props.trailing ?? props.right ?? (actions.length > 0 ? <Box className="flex-row" style={{ gap: spacing.row }}>{actions.map((a) => <IconButton key={a.label} icon={a.icon} label={a.label} onPress={a.onPress} fill />)}</Box> : undefined),
  };
}

/** A page under a tab shows the now bar whenever something is loaded (as the Me tab does); a pushed page follows the toast placement's rule. */
function TabNow(props: { children: (now: boolean) => React.ReactElement }): React.ReactElement {
  const idle = usePlayerSelector(selectIdle);
  return props.children(!idle);
}
/** A page that says for itself (`now`) never asks the router for its path: a composer page leaves the foot to its own zone. */
function FixedNow(props: { value: boolean; children: (now: boolean) => React.ReactElement }): React.ReactElement {
  return props.children(props.value);
}
function PushedNow(props: { children: (now: boolean) => React.ReactElement }): React.ReactElement {
  return props.children(useToastPlacement().now);
}

export function FeedPage<T>(props: PageListProps<T> & Frame): React.ReactElement {
  const { onBack, backLabel, actions, right, leading, trailing, now, safeBottom, ...rest } = props;
  const frame = useFrame({ onBack, backLabel, actions, right, leading, trailing });
  const draw = (flag: boolean) => <PageList<T> {...(rest as PageListProps<T>)} leading={frame.leading} trailing={frame.trailing} now={now ?? flag} safeBottom={safeBottom ?? (rest.tabs === true ? undefined : 0)} />;
  if (now !== undefined) return <FixedNow value={now}>{draw}</FixedNow>;
  const Now = rest.tabs === true ? TabNow : PushedNow;
  return <Now>{draw}</Now>;
}

export function FeedScroll(props: Frame & Omit<React.ComponentProps<typeof Page>, 'leading' | 'trailing'> & { leading?: React.ReactNode; trailing?: React.ReactNode; subtitle?: string }): React.ReactElement {
  const { onBack, backLabel, actions, right, leading, trailing, now, subtitle, children, ...rest } = props;
  const placed = useToastPlacement();
  const frame = useFrame({ onBack, backLabel, actions, right, leading, trailing });
  // `Page` reads the safe area through the hook, which throws outside a provider (a screen rendered alone, as the page tests do); `PageList` does not.
  const insets = useContext(SafeAreaInsetsContext);
  const page = (
    <Page {...rest} leading={frame.leading} trailing={frame.trailing} now={now ?? placed.now}>
      {subtitle ? <Type step="caption" className="text-text2" numberOfLines={2}>{subtitle}</Type> : null}
      {children}
    </Page>
  );
  return insets ? page : <SafeAreaInsetsContext.Provider value={NO_INSETS}>{page}</SafeAreaInsetsContext.Provider>;
}

/** Grey rows that breathe where the cards will be. */
export function FeedLoading(props: { rows?: number; testID?: string }): React.ReactElement {
  return (
    <Box testID={props.testID ?? 'feed-loading'}>
      <GhostRows rows={props.rows ?? 4} />
    </Box>
  );
}

/** Nothing here yet (or signed out): the title, the line under it and, when the page has one, a light button. A line left out draws none. */
export function FeedEmpty(props: { title: string; line?: string; action?: { label: string; onPress: () => void }; children?: React.ReactNode }): React.ReactElement {
  return (
    <Box testID="page-empty" className="items-center" style={{ gap: spacing.gap, paddingVertical: spacing.group }}>
      <Box className="items-center" style={{ gap: spacing.gap }} accessible accessibilityLabel={props.line ? `${props.title} ${props.line}` : props.title}>
        <Type step="heading" className="text-text text-center">{props.title}</Type>
        {props.line ? <Type step="body" className="text-text2 text-center">{props.line}</Type> : null}
      </Box>
      {props.action ? <PulseButton label={props.action.label} kind="light" onPress={props.action.onPress} /> : null}
      {props.children}
    </Box>
  );
}
