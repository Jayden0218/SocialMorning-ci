// Words in one step of the Pulse type scale: face, size, line height and tracking from the tokens.
/**
 * M31 T021/T022: `<Type step="row" className="text-text">Title</Type>` is the Pulse type scale
 * (`typeScale` in src/design/tokens.ts) as one component — the step's classes pick the font file
 * (`font-display`, `font-mono` …) and the size (`text-pulse-row`), and its line height and
 * letter spacing come from `typeStyle`, so a screen never writes `text-[15px]` or a line height.
 * The colour is always the caller's (`text-text`, `text-text2`, `text-hotText` …): the token
 * checks read it from the `className`, and a Text with no colour draws black on black.
 */
import { Text } from '@/ui/lib/text';
import { typeScale, typeStyle, type TypeName } from '@/design';

type TextProps = React.ComponentProps<typeof Text>;

/**
 * M31 F10 (FR-031): how far the system font size may grow this step. The Pulse boxes are drawn at fixed sizes, so every step stops at 1.3 times
 * (about 130 %): a screen reader's 200 % then neither clips a word nor loses a control. A caller can pass its own `maxFontSizeMultiplier`
 * (a long-reading Text that sits in a box that grows may allow more).
 */
export const TYPE_CAP = 1.3;

export function Type(props: Omit<TextProps, 'className'> & { step: TypeName; className: string }): React.ReactElement {
  const { step, className, style, ...rest } = props;
  return <Text className={`${typeScale[step].cls} ${className}`} style={style ? [typeStyle(step), style] : typeStyle(step)} maxFontSizeMultiplier={TYPE_CAP} {...rest} />;
}
