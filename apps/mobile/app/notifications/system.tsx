// System: messages from SocialNet, each card with at most one button into the app.
/**
 * M21 US10 (T108): the System notices, moved out of the Notifications page's first tab into
 * their own page, opened from the "System" card at the top of Notifications. The server sends
 * no system messages yet, so the list is empty and says so; when it does, each one is drawn
 * by `SystemNoticeCard`, whose one button opens a page in the app (never a web address).
 */
import { ScrollView } from '@/ui/lib/scroll-view';
import { PageHeader } from '@/ui/kit/PageHeader';
import { EmptyPicture } from '@/ui/me/parts';
import { SystemNoticeCard } from '@/ui/social/SystemNoticeCard';
import type { SystemNotice } from '@/social/notifications-api';

/** No server source yet (M21 US10): an empty list, so the page shows its empty picture. */
const NOTICES: readonly SystemNotice[] = [];

export default function SystemNoticesScreen(): React.ReactElement {
  return (
    <>
      <PageHeader title="System" />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-gap pb-24 gap-row flex-grow">
        {NOTICES.length === 0
          ? <EmptyPicture icon="notifications-outline" line="No messages from SocialNet yet — announcements and account notices will appear here" />
          : NOTICES.map((n) => <SystemNoticeCard key={n.id} notice={n} />)}
      </ScrollView>
    </>
  );
}
