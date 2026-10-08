// System: messages from SocialNet, each card with at most one button into the app.
/**
 * M21 US10 (T108): the System notices, moved out of the Notifications page's first tab into
 * their own page, opened from the "System" card at the top of Notifications. Each one is drawn
 * by `SystemNoticeCard`, whose one button opens a page in the app (never a web address).
 *
 * M24 US3: the list comes from the server (`GET /v1/me/notifications/system`) — notices the
 * admin writes for everyone, and account notices for this listener alone (e.g. "Your comment was
 * removed", with an Appeal button). Signed out, or a failed load, shows the empty picture.
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Loader } from '@/ui/kit/Loader';
import { EmptyPicture } from '@/ui/me/parts';
import { SystemNoticeCard } from '@/ui/social/SystemNoticeCard';
import { useSocial } from '@/social/context';
import { useNotificationsApi, type SystemNotice } from '@/social/notifications-api';
import { reportAndDrop } from '@/telemetry/reportError';

export default function SystemNoticesScreen(): React.ReactElement {
  const { listener } = useSocial();
  const api = useNotificationsApi();
  const [notices, setNotices] = useState<readonly SystemNotice[] | undefined>(undefined);
  const load = useCallback(async () => {
    if (!listener) { setNotices([]); return; }
    try { setNotices(await api.system()); }
    catch (e) { reportAndDrop('notices.system')(e); setNotices((n) => n ?? []); }
  }, [api, listener]);
  useEffect(() => { void load(); }, [load]);
  return (
    <>
      <PageHeader title="System" />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-gap pb-24 gap-row flex-grow">
        {notices === undefined ? <Loader /> : notices.length === 0
          ? <EmptyPicture icon="notifications-outline" line="No messages from SocialNet yet — announcements and account notices will appear here" />
          : notices.map((n) => <SystemNoticeCard key={n.id} notice={n} />)}
      </ScrollView>
    </>
  );
}
