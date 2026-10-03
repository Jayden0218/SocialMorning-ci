/**
 * A navigation link a screen reader announces as a link.
 *
 * A bare `<Link>text</Link>` renders an `android.view.View` with `clickable="false"` and
 * no role — TalkBack reads the words and never says "link" (found on the phone, J5 on
 * builds 17 and 18; `accessibilityRole` on the Link itself does not change the node).
 * `asChild` hands the press to a Pressable, which Android exposes properly.
 */
import { Link } from '@/design/tailwind';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import type { ComponentProps } from 'react';

export function NavLink(props: { href: ComponentProps<typeof Link>['href']; label: string; className?: string }): React.ReactElement {
  return (
    <Link href={props.href} asChild>
      {/* M7: a *row*, not a floating word. On build 20 these were six accent words spaced far
          apart down a black screen, which read as a list of warnings rather than a menu. */}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={props.label}
        className={`min-h-12 py-row justify-center border-b-hairline border-separator ${props.className ?? ''}`}
      >
        {/* The text is plain; the *row* is the affordance. Keeping the accent for every link
            would put six red lines on a screen that has one real action. */}
        <Text className="text-sm text-text">{props.label}</Text>
      </Pressable>
    </Link>
  );
}
