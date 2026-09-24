/**
 * A navigation link a screen reader announces as a link.
 *
 * A bare `<Link>text</Link>` renders an `android.view.View` with `clickable="false"` and
 * no role — TalkBack reads the words and never says "link" (found on the phone, J5 on
 * builds 17 and 18; `accessibilityRole` on the Link itself does not change the node).
 * `asChild` hands the press to a Pressable, which Android exposes properly.
 */
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { ComponentProps } from 'react';
import { colour } from '../design';

export function NavLink(props: { href: ComponentProps<typeof Link>['href']; label: string }): React.ReactElement {
  return (
    <Link href={props.href} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={props.label} style={styles.row}>
        <Text style={styles.text}>{props.label}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
  text: { fontSize: 16, color: colour.accent },
});
