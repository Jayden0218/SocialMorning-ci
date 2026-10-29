// The rows of a Pulse comment sheet: a 40 icon square, the words, a rule above the safety rows.
/**
 * M31 W2-B (`social.html` `srow`, `rule`, `cancelBtn`): a row is 52 tall, the icon sits in a 40 square (radius 12, raise
 * fill; light with a void glyph when the row's setting is on), the words are Geist 600 15 in text colour — or in hot text
 * for the safety rows (Mark as unfriendly, Report, Delete, which also sit under a 1 px rule) — and an optional detail in
 * mono text3 (hot text when on) closes the row. A row is a button named by its words (plus its detail).
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { colour } from '@/design';
import { COMMENTS } from './measures';

const ROW = { minHeight: COMMENTS.menuRow, gap: 14 };
const SQUARE = { width: COMMENTS.menuIcon, height: COMMENTS.menuIcon, borderRadius: COMMENTS.menuIconRadius };

export function MenuRow(props: {
  icon: IconName;
  label: string;
  detail?: string;
  /** A safety row: hot-text words and icon. */
  danger?: boolean;
  /** The setting is on: the square turns light. */
  on?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}): React.ReactElement {
  const glyph = props.on ? colour.void : props.danger ? colour.hotText : colour.text;
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityState={props.on !== undefined ? { selected: props.on } : undefined}
      className="flex-row items-center"
      style={ROW}
    >
      <Box className={`items-center justify-center ${props.on ? 'bg-text' : 'bg-raise'}`} style={SQUARE}>
        <Icon name={props.icon} size={20} color={glyph} />
      </Box>
      <Type step="row" className={props.danger ? 'text-hotText flex-1' : 'text-text flex-1'}>{props.label}</Type>
      {props.detail ? <Type step="mono" className={props.on ? 'text-hotText' : 'text-text3'}>{props.detail}</Type> : null}
    </Pressable>
  );
}

/** The 1 px hairline above the safety rows (2 of margin above and below, as drawn). */
export function MenuRule(): React.ReactElement {
  return <Box className="bg-line" style={{ height: 1, marginVertical: 2 }} />;
}
