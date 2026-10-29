// The sheet a comment's ⋯ (or a tap on it) opens: the comment on a card, then its actions, Cancel at the foot.
/**
 * M31 W2-B (`social.html` `comments--comment-menu`, `-host`, `-signed-out`, `comment-thread--comment-menu`): the kit sheet
 * with no title; the comment on a raise card (radius 18, padding 12) — a 22 avatar, the author in Geist 600 13, the moment
 * as a chip, the words in Unbounded 600 17 — so you know what you are acting on; then 52 rows (MenuRow); Mark as
 * unfriendly and, under a rule, Report or Delete in hot text; and a full-width quiet Cancel. Tall menus (the host's) scroll
 * inside 88 % of the screen with Cancel at the foot. The items come from the page, so each page keeps its own actions
 * (Reply, Share, Copy, Save, Pin, Mute …); this sheet only draws them, and a tap closes the sheet and runs the item.
 */
import { ScrollView, useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Avatar } from '@/ui/kit/Avatar';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { PulseButton } from '@/ui/kit/PulseButton';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import type { IconName } from '@/ui/kit/Icon';
import { mmss } from '@/ui/kit/format';
import type { Comment } from '@/social/api';
import { MenuRow, MenuRule } from './MenuRows';
import { COMMENTS } from './measures';

export type MenuItem = { label: string; run: () => void };

/** The drawn icon for each action (design-pulse2 `srow` names, in the app's icon names). */
export const MENU_ICON: Record<string, IconName> = {
  Reply: 'arrow-undo-outline',
  Share: 'share-outline',
  Copy: 'copy-outline',
  Save: 'bookmark-outline',
  'Remove from saved': 'bookmark',
  Mute: 'volume-mute-outline',
  Pin: 'pin',
  Unpin: 'pin',
  'Pin to bottom': 'arrow-down-outline',
  'Unpin from bottom': 'arrow-up-outline',
  'Mark as unfriendly': 'alert-circle-outline',
  Unmark: 'alert-circle-outline',
  'Stop like notices': 'notifications-off-outline', // M22 US3
  'Turn like notices back on': 'notifications-outline',
  Delete: 'trash-outline',
  Report: 'flag-outline',
};

/** Rows set apart under the rule, in hot text. */
export const SAFETY = ['Mark as unfriendly', 'Unmark', 'Report', 'Delete'];
const UNDER_RULE = ['Report', 'Delete'];

export function CommentMenu(props: { comment: Comment | undefined; items: readonly MenuItem[]; onClose: () => void }): React.ReactElement | null {
  const { height } = useWindowDimensions();
  const x = props.comment;
  const rows = props.items;
  return (
    <ActionSheet open={x !== undefined} onClose={props.onClose} label="Comment actions">
      {x ? (
        <Box className="bg-raise" style={{ borderRadius: COMMENTS.quoteRadius, padding: COMMENTS.quotePad, gap: 6 }} accessible accessibilityLabel={`${x.displayName ?? 'A listener'}${x.offsetMs !== null ? ` at ${mmss(x.offsetMs)}` : ''}: ${x.body ?? ''}`}>
          <Box className="flex-row items-center" style={{ gap: 8 }}>
            <Avatar size={COMMENTS.quoteAvatar} url={x.avatarUrl} name={x.displayName} />
            <Type step="caption" className="text-text font-semibold flex-1" numberOfLines={1}>{x.displayName ?? 'A listener'}</Type>
            {x.offsetMs !== null ? <Box><TimestampChip text={mmss(x.offsetMs)} /></Box> : null}
          </Box>
          {x.body ? <Type step="section" className="text-text font-display font-semibold" numberOfLines={4}>{x.body}</Type> : null}
        </Box>
      ) : null}
      <ScrollView style={{ maxHeight: Math.round(height * 0.88) - 150 }} bounces={false} showsVerticalScrollIndicator={false}>
        <Box>
          {rows.map((item) => (
            <Box key={item.label}>
              {UNDER_RULE.includes(item.label) ? <MenuRule /> : null}
              <MenuRow
                icon={MENU_ICON[item.label] ?? 'flag-outline'}
                label={item.label}
                danger={SAFETY.includes(item.label)}
                onPress={() => { props.onClose(); item.run(); }}
              />
            </Box>
          ))}
        </Box>
      </ScrollView>
      <PulseButton label="Cancel" kind="quiet" onPress={props.onClose} full />
    </ActionSheet>
  );
}
