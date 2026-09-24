/**
 * Every screen's outer frame (M7): the dark background, the safe areas, and — the part
 * that is easy to forget — bottom padding equal to the mini player plus the tab bar, so
 * the last row of a list is never hidden underneath them.
 */
import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { colour, spacing } from '../design';

/** Height of the mini player and the tab bar, so lists can reserve room for both. */
export const MINI_PLAYER_HEIGHT = 64;
export const TAB_BAR_HEIGHT = 56;
export const BOTTOM_INSET = MINI_PLAYER_HEIGHT + TAB_BAR_HEIGHT;

export function Screen(props: ViewProps & { scroll?: boolean; padded?: boolean }): React.ReactElement {
  const { scroll, padded = true, style, children, ...rest } = props;
  const content = [padded ? styles.padded : null, styles.bottom, style];
  if (scroll) {
    return (
      <ScrollView style={styles.fill} contentContainerStyle={content} {...rest}>
        {children}
      </ScrollView>
    );
  }
  return (
    <View style={[styles.fill, ...content]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colour.background },
  padded: { paddingHorizontal: spacing.screenX },
  bottom: { paddingBottom: BOTTOM_INSET },
});
