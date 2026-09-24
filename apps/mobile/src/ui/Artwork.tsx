/**
 * Episode or show artwork at a fixed size (M7). An episode with no artwork gets the
 * placeholder, never a blank square (research R4).
 */
import { Image, StyleSheet, View } from 'react-native';
import { colour, radius } from '../design';

export function Artwork(props: { url?: string | null; size: number; rounded?: keyof typeof radius }): React.ReactElement {
  const r = radius[props.rounded ?? 'row'];
  const box = { width: props.size, height: props.size, borderRadius: r };
  if (!props.url) {
    return <View style={[styles.placeholder, box]} accessible={false} importantForAccessibility="no-hide-descendants" />;
  }
  return <Image source={{ uri: props.url }} style={[styles.placeholder, box]} accessible={false} importantForAccessibility="no-hide-descendants" />;
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: colour.surface },
});
