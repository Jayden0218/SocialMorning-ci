// The Pulse buttons: light, hot, ring and quiet pills, and the round icon button; kind quiet / ring is the kit's TextAction (no separate part).
/**
 * M31 T022 (design-pulse2 `kit.css` `.btn`, `.ibtn`; index.html §Bars). A button is 48 tall, 22 pt
 * of padding each side, a full pill, its words Geist 600 15/20 (the Row step):
 *   light → text fill, void words      hot → hot fill, void words (white on hot fails, 3.21)
 *   ring  → 1.5 outline at text 50 %   quiet → raise fill, text words
 * `IconButton` is the 44 round button of the title bar and the bars (`fill` = raise disc).
 * Same behaviour as the older `Button`: the press is dropped while `busy`, which swaps the words
 * for the sound bars at the same size; `disabled` dims to 40 %. Pressed: the fill dims to 85 %
 * for 120 ms (motion.tap) — no scale, no shadow.
 */
import { Pressable } from '@/ui/lib/pressable';
import { bars, hit } from '@/design';
import { Type } from './Type';
import { BusyContent } from './BusyContent';
import { Icon, type IconName } from './Icon';
import { useColours } from './useColours';

/** `quiet2`: the quiet pill for use on a raise tile (raise-2 fill, so it shows against the tile — Settings' Unblock, Clear cache). */
export type PulseButtonKind = 'light' | 'hot' | 'ring' | 'quiet' | 'quiet2';

const FILL: Record<PulseButtonKind, string> = {
  light: 'bg-text',
  hot: 'bg-hot',
  ring: 'bg-transparent border-outline',
  quiet: 'bg-raise',
  quiet2: 'bg-raise2',
};
/** Words: void on the two solid fills, text on the other two. */
const WORDS: Record<PulseButtonKind, string> = { light: 'text-void', hot: 'text-void', ring: 'text-text', quiet: 'text-text', quiet2: 'text-text' };
const BARS: Record<PulseButtonKind, string> = { light: 'bg-void', hot: 'bg-void', ring: 'bg-text', quiet: 'bg-text', quiet2: 'bg-text' };

const HEIGHT = { height: hit.min };

export function PulseButton(props: {
  label: string;
  onPress: () => void;
  kind?: PulseButtonKind;
  /** An icon before the words (16, in the words' colour). */
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  /** Spoken name when it differs from the label. */
  accessibilityLabel?: string;
  /** Stretch to the full width of its row (a sheet's last button, an empty state's action stays natural). */
  full?: boolean;
  /** Side padding when the drawing sets its own (the Episode page's Subscribe ring is 18). */
  padX?: number;
  /** A setting-like button that is on (Subscribed): spoken as selected. */
  selected?: boolean;
  className?: string;
  /** The words in hot-text (the drawings' Cancel on a sheet: `btn quiet` in #FF8095). Quiet and ring only. */
  hotWords?: boolean;
  /** The drawn height when it is not 48 (a card's Retry or action is 40, Follow 30, Play 36); the touch area still reaches 48. */
  height?: number;
  /** F10: the words shrink to fit the pill's width on one line (a pill that is narrower than its words at 320 wide or 200 % text). */
  fit?: boolean;
}): React.ReactElement {
  const kind = props.kind ?? 'light';
  const busy = props.busy === true;
  const dim = props.disabled === true && !busy;
  const c = useColours();
  const glyph = kind === 'light' || kind === 'hot' ? c.void : c.text;
  return (
    <Pressable
      onPress={busy || dim ? undefined : props.onPress}
      disabled={dim}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityState={{ disabled: props.disabled === true || busy, busy, ...(props.selected !== undefined ? { selected: props.selected } : {}) }}
      className={`px-block rounded-pill items-center justify-center ${kind === 'ring' ? 'border-[1.5px]' : ''} ${FILL[kind]} ${props.full ? 'self-stretch' : ''} ${dim ? 'opacity-40' : 'active:opacity-85'} ${props.className ?? ''}`}
      style={props.height !== undefined ? [{ height: props.height }, ...(props.padX !== undefined ? [{ paddingHorizontal: props.padX }] : [])] : props.padX !== undefined ? [HEIGHT, { paddingHorizontal: props.padX }] : HEIGHT}
      {...(props.height !== undefined && props.height < hit.min ? { hitSlop: { top: Math.ceil((hit.min - props.height) / 2), bottom: Math.ceil((hit.min - props.height) / 2) } } : {})}
    >
      <BusyContent busy={busy} barClassName={BARS[kind]} className="flex-row items-center justify-center gap-hair">
        {props.icon ? <Icon name={props.icon} size={16} color={glyph} /> : null}
        <Type step="row" className={props.hotWords === true && (kind === 'quiet' || kind === 'ring') ? 'text-hotText' : WORDS[kind]} numberOfLines={1} {...(props.fit ? { adjustsFontSizeToFit: true, minimumFontScale: 0.7 } : {})}>{props.label}</Type>
      </BusyContent>
    </Pressable>
  );
}

/** The 44 round button: a title bar's back and actions, the now bar's buttons. `fill` puts a raise disc behind the glyph. */
export function IconButton(props: {
  icon: IconName;
  /** The spoken name — an icon alone says nothing. */
  label: string;
  onPress: () => void;
  fill?: boolean;
  size?: number;
  /** The disc's width and height (44; the sheet's close circle is 36 and gets `hitSlop` to 44). */
  diameter?: number;
  /** The glyph colour name from the palette; the text colour by default. */
  tone?: 'text' | 'text2' | 'hotText' | 'void';
  disabled?: boolean;
  /** A setting is on: the disc turns light with a void glyph (the comments page's options circle). */
  selected?: boolean;
  className?: string;
}): React.ReactElement {
  const c = useColours();
  const dim = props.disabled === true;
  const on = props.selected === true;
  const d = props.diameter ?? bars.circle;
  const slop = Math.max(0, Math.ceil((bars.circle - d) / 2));
  return (
    <Pressable
      onPress={dim ? undefined : props.onPress}
      disabled={dim}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={props.selected === undefined ? { disabled: dim } : { disabled: dim, selected: on }}
      hitSlop={slop}
      className={`rounded-pill items-center justify-center ${on ? 'bg-text' : props.fill ? 'bg-raise' : ''} ${dim ? 'opacity-40' : ''} ${props.className ?? ''}`}
      style={{ width: d, height: d }}
    >
      <Icon name={props.icon} size={props.size ?? 22} color={on ? c.void : c[props.tone ?? 'text']} />
    </Pressable>
  );
}
