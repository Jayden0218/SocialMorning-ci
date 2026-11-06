// The Form template (spec 039): a pushed page of fields on design B's `Page` — Back, title, helper line, fields, ONE primary action.
/**
 * Spec 039 (D7, Form lane): what `PushedPage` did for a page with plain children, built on `Page` itself so the ratchet counts it. The page glow
 * sits behind a transparent `Page` (Back leading, the title in the `title` step, optional trailing actions); a short helper line (`subtitle`) and
 * `extra` come first, then the fields; `below` is the primary action drawn over the foot (it rides above the keyboard where the page's
 * `KeyboardPage` lifts it) and the page leaves its height + 12 under the last field. The root layout pads the home strip once (guard G-T1), so
 * Page sees only `safeBottom`. Keyboard handling stays the page's own (`KeyboardPage` around this, as before).
 */
import { useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { bars, gutter, nowBarBottom } from '@/design';
import { goBack } from '@/ui/kit/PageHeader';
import { IconButton } from '@/ui/kit/PulseButton';
import { PageGlow, type GlowTone } from '@/ui/kit/PageGlow';
import { Type } from '@/ui/kit/Type';
import type { IconName } from '@/ui/kit/Icon';
import { Page } from '@/ui/kit/layout';
import { useToastPlacement } from '@/ui/shell/toastPlacement';
import { liftedBottom, useKeyboardHeight } from '@/ui/kit/useKeyboardHeight';

const BELOW_GAP = 12;
/** Between the keyboard's top and a foot slot riding above it (PushedPage's). */
const KEYBOARD_GAP = 8;
const KEEP_TAPS = { keyboardShouldPersistTaps: 'handled' } as const;

type FormPageProps = {
  title: string;
  /** The short helper line under the title. */
  subtitle?: string;
  /** Replaces the default Back. `null` shows no Back. */
  onBack?: (() => void) | null;
  backLabel?: string;
  backIcon?: IconName;
  /** After the title (actions). */
  trailing?: React.ReactNode;
  /** The now bar shows over the foot (default: the toast placement's rule). */
  now?: boolean;
  /** The home strip, for a page outside the root layout's padding (a modal route). */
  safeBottom?: number;
  tone?: GlowTone | 'none';
  /** Under the helper line, before the fields. */
  extra?: React.ReactNode;
  /** The primary action, drawn over the foot above the bars. `belowHeight` is its height. */
  below?: React.ReactNode;
  belowHeight?: number;
  /** The foot slot rides above the keyboard (default). A page inside a KeyboardAvoidingView that already lifts it passes false. */
  keyboardLift?: boolean;
  children?: React.ReactNode;
};

/** A page that says whether the now bar shows (`now`) never asks the router; the others ask the toast placement's rule. */
export function FormPage(props: FormPageProps): React.ReactElement {
  return props.now !== undefined ? <FormFrame {...props} now={props.now} /> : <FormPlaced {...props} />;
}

function FormPlaced(props: FormPageProps): React.ReactElement {
  const placed = useToastPlacement();
  return <FormFrame {...props} now={placed.now} />;
}

function FormFrame(props: FormPageProps & { now: boolean }): React.ReactElement {
  const insets = useContext(SafeAreaInsetsContext);
  const { width } = useWindowDimensions();
  const lift = props.below ? (props.belowHeight ?? 0) + BELOW_GAP : 0;
  const keyboardUp = useKeyboardHeight();
  const keyboard = props.keyboardLift === false ? 0 : keyboardUp;
  // PushedPage's rule: the root pads the home strip once; while the keyboard is up the `below` slot rides above it.
  const rest = nowBarBottom(0) + (props.now ? bars.now + bars.titleAboveNow : 0);
  const padded = { titleBottom: rest + (props.safeBottom ?? 0) };
  const strip = props.safeBottom ? 0 : (insets?.bottom ?? 0);
  const layout = { titleBottom: liftedBottom(padded.titleBottom, keyboard, strip, KEYBOARD_GAP) };
  const onBack = props.onBack === undefined ? goBack : props.onBack ?? undefined;
  const own = { top: insets?.top ?? 0, bottom: props.safeBottom ?? 0, left: insets?.left ?? 0, right: insets?.right ?? 0 };
  return (
    <Box className="flex-1 bg-void" testID="pushed-page">
      {props.tone === 'none' ? null : <PageGlow tone={props.tone ?? 'hot'} />}
      <SafeAreaInsetsContext.Provider value={own}>
        <Page
          title={props.title}
          transparent
          now={props.now}
          footExtra={lift}
          // Forms keep a tap on a button working while the keyboard is up (as SetPage did). Page's `scroll` type does not list it yet: coordinator.
          scroll={KEEP_TAPS}
          {...(onBack ? { leading: <IconButton icon={props.backIcon ?? 'chevron-back'} label={props.backLabel ?? 'Back'} onPress={onBack} fill size={22} /> } : {})}
          {...(props.trailing ? { trailing: props.trailing } : {})}
        >
          {props.subtitle ? <Type step="caption" className="text-text2" numberOfLines={3}>{props.subtitle}</Type> : null}
          {props.extra ?? null}
          {props.children}
        </Page>
      </SafeAreaInsetsContext.Provider>
      {props.below ? (
        <Box testID="pushed-below" className="absolute left-0 right-0" style={{ bottom: layout.titleBottom, paddingHorizontal: gutter(width), gap: BELOW_GAP, zIndex: 20 }}>{props.below}</Box>
      ) : null}
    </Box>
  );
}
