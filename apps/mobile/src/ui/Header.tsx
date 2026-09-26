/**
 * The large translucent header (M7 FR-006). Blur comes from `expo-blur`; when it is
 * unavailable the header falls back to a solid bar in the background colour, which is
 * the whole of Principle IV here — a header that fails to blur must not fail to exist.
 */
import { Text, View } from 'react-native';
import { spacing } from '../design';

/** Injected so the test can exercise the fallback without a native module. */
export type BlurComponent = React.ComponentType<{ intensity?: number; tint?: string; style?: unknown; children?: React.ReactNode }>;

let Blur: BlurComponent | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Blur = (require('expo-blur') as { BlurView?: BlurComponent }).BlurView;
} catch {
  Blur = undefined; // fall back to solid
}

/**
 * The blur view is not a component NativeWind styles (nor is a test's stand-in), so its
 * padding stays a style. Same values as the solid bar's `px-screen-x py-row`.
 */
const BLUR_BAR = { paddingHorizontal: spacing.screenX, paddingVertical: spacing.row, overflow: 'hidden' } as const;

export function Header(props: { title: string; blur?: BlurComponent | null; className?: string }): React.ReactElement {
  const B = props.blur === null ? undefined : (props.blur ?? Blur);
  const inner = (
    <Text className="text-text text-lg font-bold" accessibilityRole="header" numberOfLines={2}>
      {props.title}
    </Text>
  );
  if (!B) return <View className={`px-screen-x py-row overflow-hidden bg-background ${props.className ?? ''}`}>{inner}</View>;
  return (
    <B intensity={60} tint="dark" style={BLUR_BAR}>
      {inner}
    </B>
  );
}
