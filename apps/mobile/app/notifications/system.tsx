// System: messages from SocialNet, each card with at most one button into the app.
/**
 * M21 US10 (T108): the System notices, moved out of the Notifications page's first tab into
 * their own page, opened from the "System" chip at the top of Notifications. Each one is drawn
 * by `SystemNoticeCard`, whose one button opens a page in the app (never a web address).
 *
 * M24 US3: the list comes from the server (`GET /v1/me/notifications/system`) — notices the
 * admin writes for everyone, and account notices for this listener alone (e.g. "Your comment was
 * removed", with an Appeal button). Signed out, or a failed load, shows the empty picture.
 *
 * Spec 039 (Feed lane, `design/B-Notifications.dc.html`): a `FeedPage` (Back + "System" + "Messages from SocialNet"); a day is a small caps
 * heading over its cards; no spine, no tick. None yet is the empty block "No messages yet" with the sentence under it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FeedLoading, FeedPage } from '@/ui/feed/FeedPage';
import { EmptyBlock, Day } from '@/ui/notifications/cards';
import { groupByDay } from '@/ui/notifications/parts';
import { SystemNoticeCard } from '@/ui/social/SystemNoticeCard';
import { useSocial } from '@/social/context';
import { useNotificationsApi, type SystemNotice } from '@/social/notifications-api';
import { reportAndDrop } from '@/telemetry/reportError';
import { nowMs } from '@/ui/kit/clock';

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
  const days = useMemo(() => groupByDay(notices ?? [], (n) => n.createdAt, new Date(nowMs())), [notices]);
  return (
    <FeedPage
      title="System"
      subtitle="Messages from SocialNet"
      data={days}
      keyExtractor={(d) => d.key}
      contentStyle={{ flexGrow: 1 }}
      ListEmptyComponent={notices === undefined ? <FeedLoading testID="system-loading" rows={4} /> : <EmptyBlock title="No messages yet" line="No messages from SocialNet yet — announcements and account notices will appear here" />}
      renderItem={({ item: day }) => (
        <Day label={day.label}>
          {day.items.map((n) => <SystemNoticeCard key={n.id} notice={n} />)}
        </Day>
      )}
    />
  );
}
