// System: messages from SocialNet, each card with at most one button into the app.
/**
 * M21 US10 (T108): the System notices, moved out of the Notifications page's first tab into
 * their own page, opened from the "System" card at the top of Notifications. Each one is drawn
 * by `SystemNoticeCard`, whose one button opens a page in the app (never a web address).
 *
 * M24 US3: the list comes from the server (`GET /v1/me/notifications/system`) — notices the
 * admin writes for everyone, and account notices for this listener alone (e.g. "Your comment was
 * removed", with an Appeal button). Signed out, or a failed load, shows the empty picture.
 *
 * M31 W4-C (T052; design-pulse2 `social.html#notifications-system--screen`, `--empty`; layout pattern Thread): the notices hang on the spine, each
 * ticked by its date (`SystemNoticeCard` draws the card); the title bar is low: "System", "Messages from SocialNet". None yet is the
 * empty block "No messages yet" with the sentence under it.
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { PushedPage } from '@/ui/kit/PushedPage';
import { GhostRows, Tick } from '@/ui/comments/Spine';
import { PageEmpty, ThreadNode } from '@/ui/me/lists';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { Box } from '@/ui/lib/box';
import { SystemNoticeCard } from '@/ui/social/SystemNoticeCard';
import { DayBlock, SpineColumn } from '@/ui/notifications/parts';
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
    <PushedPage title="System" subtitle="Messages from SocialNet">
      {(layout) => (
        <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1, paddingTop: layout.top, paddingBottom: layout.reserve }}>
          {notices === undefined ? (
            <Box testID="system-loading" style={{ marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right }}><GhostRows rows={4} /></Box>
          ) : notices.length === 0 ? (
            <PageEmpty top={ME_MOSAIC.row * 2} title="No messages yet" line="No messages from SocialNet yet — announcements and account notices will appear here" />
          ) : (
            <SpineColumn>
              <DayBlock>
                {notices.map((n) => (
                  <ThreadNode key={n.id} lead={<Tick text={new Date(n.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short' })} />}>
                    <SystemNoticeCard notice={n} />
                  </ThreadNode>
                ))}
              </DayBlock>
            </SpineColumn>
          )}
        </ScrollView>
      )}
    </PushedPage>
  );
}
