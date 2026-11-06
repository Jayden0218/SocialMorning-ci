// The frame of a Detail page (one thing in depth): Page or PageList with Back, the toast placement's now flag and a home strip the root already padded.
/**
 * Spec 039 (Detail lane). A pushed page sits under the root layout, which pads the home strip once (guard G-T1), so a bare `Page` would pad it a second
 * time: `DetailPage` gives `Page` a safe-area context whose bottom is `safeBottom` (0 unless a modal route pads itself), as `PushedPage` does for its
 * plain-children pages. `DetailList` is `PageList` with the same defaults (it has `safeBottom` of its own). Both lead with a Back circle
 * (`goBack`, or `onBack`; `back={false}` for a page with no Back) and take `now` from the toast placement unless the page says.
 */
import { useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Page, PageList } from '@/ui/kit/layout';
import type { PageListProps } from '@/ui/kit/layout/PageList';
import { goBack } from '@/ui/kit/PageHeader';
import { IconButton } from '@/ui/kit/PulseButton';
import { useToastPlacement } from '@/ui/shell/toastPlacement';

type Back = { onBack?: () => void; backLabel?: string; back?: boolean };

function BackCircle(props: Back): React.ReactElement | undefined {
  if (props.back === false) return undefined;
  return <IconButton icon="chevron-back" label={props.backLabel ?? 'Back'} onPress={props.onBack ?? goBack} fill size={22} />;
}

export function DetailPage(props: Back & {
  title: string;
  titleLabel?: string;
  onTitle?: () => void;
  trailing?: React.ReactNode;
  /** Overrides the toast placement's rule for the now bar. */
  now?: boolean;
  /** The home strip, for a page outside the root's padding (a modal route). */
  safeBottom?: number;
  footExtra?: number;
  scroll?: React.ComponentProps<typeof Page>['scroll'];
  scrollRef?: React.ComponentProps<typeof Page>['scrollRef'];
  children?: React.ReactNode;
}): React.ReactElement {
  const insets = useContext(SafeAreaInsetsContext);
  const placed = useToastPlacement();
  const own = { top: insets?.top ?? 0, bottom: props.safeBottom ?? 0, left: insets?.left ?? 0, right: insets?.right ?? 0 };
  const leading = BackCircle(props);
  return (
    <SafeAreaInsetsContext.Provider value={own}>
      <Page
        title={props.title}
        {...(props.titleLabel ? { titleLabel: props.titleLabel } : {})}
        {...(props.onTitle ? { onTitle: props.onTitle } : {})}
        {...(leading ? { leading } : {})}
        {...(props.trailing ? { trailing: props.trailing } : {})}
        {...(props.scroll ? { scroll: props.scroll } : {})}
        {...(props.scrollRef ? { scrollRef: props.scrollRef } : {})}
        {...(props.footExtra ? { footExtra: props.footExtra } : {})}
        now={props.now ?? placed.now}
      >
        {props.children}
      </Page>
    </SafeAreaInsetsContext.Provider>
  );
}

export function DetailList<T>(props: Back & Omit<PageListProps<T>, 'leading'>): React.ReactElement {
  const placed = useToastPlacement();
  const { onBack, backLabel, back, now, safeBottom, ...rest } = props;
  const leading = BackCircle({ onBack, backLabel, back } as Back);
  return <PageList<T> {...(rest as PageListProps<T>)} {...(leading ? { leading } : {})} now={now ?? placed.now} safeBottom={safeBottom ?? 0} />;
}
