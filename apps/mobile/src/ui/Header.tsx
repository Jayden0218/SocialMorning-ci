/**
 * The large translucent header (M7 FR-006). Blur comes from `expo-blur`; when it is
 * unavailable the header falls back to a solid bar in the background colour, which is
 * the whole of Principle IV here — a header that fails to blur must not fail to exist.
 */
import { StyleSheet, Text, View } from 'react-native';
import { colour, fontSize, spacing } from '../design';

/** Injected so the test can exercise the fallback without a native module. */
export type BlurComponent = React.ComponentType<{ intensity?: number; tint?: string; style?: unknown; children?: React.ReactNode }>;

let Blur: BlurComponent | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Blur = (require('expo-blur') as { BlurView?: BlurComponent }).BlurView;
} catch {
  Blur = undefined; // fall back to solid
}

export function Header(props: { title: string; blur?: BlurComponent | null }): React.ReactElement {
  const B = props.blur === null ? undefined : (props.blur ?? Blur);
  const inner = (
    <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
      {props.title}
    </Text>
  );
  if (!B) return <View style={[styles.bar, styles.solid]}>{inner}</View>;
  return (
    <B intensity={60} tint="dark" style={styles.bar}>
      {inner}
    </B>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: spacing.screenX, paddingVertical: spacing.row, overflow: 'hidden' },
  solid: { backgroundColor: colour.background },
  title: { color: colour.text, fontSize: fontSize.lg, fontWeight: '700' },
});
