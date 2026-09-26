/**
 * THE list row (M7 FR-003). Every list in the app uses this one: artwork, a title of at
 * most two lines, a muted second line, an optional trailing element, a hairline
 * separator, and a tap target of at least 48 dp (M6 FR-015, carried forward).
 */
import { Pressable, Text, View } from 'react-native';
import { hit } from '../design';
import { Artwork } from './Artwork';

export const ROW_ARTWORK = 56;

/**
 * `minHeight` stays a style: shared-ui G5 reads the tap target from the outermost
 * node's `style` prop, which is NativeWind's wrapper — a className is only turned into
 * a style one level further down.
 */
const TAP = { minHeight: hit.min };

export function Row(props: {
  title: string;
  line?: string;
  artworkUrl?: string | null;
  trailing?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** The last row in a list has no separator under it. */
  last?: boolean;
  disabled?: boolean;
  className?: string;
}): React.ReactElement {
  const row = `flex-row items-center gap-row py-2 ${props.last ? '' : 'border-b-hairline border-separator'} ${props.className ?? ''}`;
  const body = (
    <>
      <Artwork url={props.artworkUrl} size={ROW_ARTWORK} />
      <View className="flex-1 gap-0.5">
        <Text className="text-text text-sm font-semibold" numberOfLines={2}>{props.title}</Text>
        {props.line ? <Text className="text-muted text-xs" numberOfLines={2}>{props.line}</Text> : null}
      </View>
      {props.trailing}
    </>
  );
  if (!props.onPress) return <View className={row} style={TAP}>{body}</View>;
  return (
    <Pressable
      className={row}
      style={TAP}
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? (props.line ? `${props.title}, ${props.line}` : props.title)}
      accessibilityState={{ disabled: props.disabled === true }}
    >
      {body}
    </Pressable>
  );
}
