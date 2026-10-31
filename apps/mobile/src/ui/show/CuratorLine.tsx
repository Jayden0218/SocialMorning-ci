// "Hosted by" line and "Shared by" line linking to who shared the show.
/**
 * M15 US4 (D3, FR-023): an external show an admin-made account shares reads
 * "Shared by <name>", linking to that account's profile — under the show title and in
 * About. The curator is never the host: the "Hosted by" line is built by `hostLineFor`
 * from the creator's own Studio names or the feed's author, and takes no curator
 * (guard G-C1, `__tests__/curator-label.test.tsx`).
 *
 * M17 (`Show-B`): under the title the line is centred, as the B header is; About's row has a
 * white bordered avatar disc.
 *
 * M31 W3-A (T040): Pulse words — text2 caption under the title (the name in hot-text), About's row a raise disc with a hot-text glyph.
 */
import { useRouter } from 'expo-router';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Type } from '@/ui/kit/Type';
import { Icon } from '@/ui/kit/Icon';
import { TAP } from '@/ui/kit/TopBar';
import { bars } from '@/design';
import type { ShowExtras } from '@/social/api';

export type Curator = NonNullable<ShowExtras['curator']>;

/** The "Hosted by" line: the creator's Studio names, else the feed's author. Never a curator. */
export function hostLineFor(overrides: ShowExtras['overrides'] | null | undefined, author: string | undefined): string | undefined {
  return overrides?.hosts?.length ? overrides.hosts.join(', ') : author;
}

export const sharedBy = (c: Curator): string => `Shared by ${c.displayName}`;

/** `row` is About's layout (an avatar circle like the host row); the default sits under the title. */
export function CuratorLine(props: { curator: Curator; row?: boolean; iconColour: string }): React.ReactElement {
  const router = useRouter();
  const open = (): void => router.push({ pathname: '/profile/[id]', params: { id: props.curator.id } });
  const label = `${sharedBy(props.curator)}. Opens their profile`;
  if (props.row) {
    return (
      <Pressable onPress={open} accessibilityRole="link" accessibilityLabel={label} className="flex-row items-center gap-row" style={TAP}>
        <Box className="rounded-pill bg-raise items-center justify-center" style={{ width: bars.circle, height: bars.circle }}>
          <Icon name="share-social-outline" size={20} color={props.iconColour} />
        </Box>
        <Box className="flex-1">
          <Type step="caption" className="text-text2">Shared by</Type>
          <Type step="row" className="text-text" numberOfLines={1}>{props.curator.displayName}</Type>
        </Box>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={open} accessibilityRole="link" accessibilityLabel={label} className="self-center justify-center" style={TAP}>
      <Type step="caption" className="text-text2 text-center" numberOfLines={1}>
        {'Shared by '}
        <Type step="caption" className="text-hotText font-semibold">{props.curator.displayName}</Type>
      </Type>
    </Pressable>
  );
}
