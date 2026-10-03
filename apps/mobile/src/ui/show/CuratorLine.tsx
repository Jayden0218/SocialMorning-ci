/**
 * M15 US4 (D3, FR-023): an external show an admin-made account shares reads
 * "Shared by <name>", linking to that account's profile — under the show title and in
 * About. The curator is never the host: the "Hosted by" line is built by `hostLineFor`
 * from the creator's own Studio names or the feed's author, and takes no curator
 * (guard G-C1, `__tests__/curator-label.test.tsx`).
 *
 * M17 (`Show-B`): under the title the line is centred, as the B header is; About's row has a
 * white bordered avatar disc.
 */
import { useRouter } from 'expo-router';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Icon } from '@/ui/Icon';
import { TAP } from '@/ui/TopBar';
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
        <Box className="w-10 h-10 rounded-pill bg-surface border border-border items-center justify-center">
          <Icon name="share-social-outline" size={20} color={props.iconColour} />
        </Box>
        <Box className="flex-1">
          <Text className="text-xs text-muted">Shared by</Text>
          <Text className="text-sm font-semibold text-text" numberOfLines={1}>{props.curator.displayName}</Text>
        </Box>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={open} accessibilityRole="link" accessibilityLabel={label} className="self-center justify-center" style={TAP}>
      <Text className="text-meta text-muted text-center" numberOfLines={1}>
        {'Shared by '}
        <Text className="text-meta font-semibold text-accent">{props.curator.displayName}</Text>
      </Text>
    </Pressable>
  );
}
