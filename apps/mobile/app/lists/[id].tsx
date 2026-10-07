// A shared show list: its title, who shared it, its shows (each opens), and Report.
/**
 * M24 US1. Opened from a list link (`socialmorning://lists/<id>`, on the list's web page). Each
 * show opens its page. Someone else's list has More → Report: hidden for me at once, then sent to
 * Admin, which can remove it for everyone. A removed or unknown list says so.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card, CardDivider } from '@/ui/kit/Card';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { Loader } from '@/ui/kit/Loader';
import { useColours } from '@/ui/kit/useColours';
import { useStores } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { useSafety } from '@/safety/context';
import { useListsApi, type SharedList } from '@/social/lists-api';
import { MoreSheet } from '@/ui/social/MoreSheet';
import { ReportSheet, type ReportTarget } from '@/ui/comments/ReportSheet';

const TAP = { minHeight: hit.min };

export default function SharedListScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const stores = useStores();
  const c = useColours(stores.settings);
  const api = useListsApi();
  const { listener } = useSocial();
  const { safety } = useSafety();
  const [list, setList] = useState<SharedList | null | undefined>(undefined);
  const [more, setMore] = useState(false);
  const [reporting, setReporting] = useState<ReportTarget | undefined>(undefined);
  useEffect(() => {
    let live = true;
    api.get(String(id ?? '')).then((l) => { if (live) setList(l ?? null); }, () => { if (live) setList(null); });
    return () => { live = false; };
  }, [api, id]);

  const hidden = list ? safety.isHidden('list', list.id) : false;
  const mine = list !== undefined && list !== null && list.owner.id === listener?.listenerId;
  const right = list && !mine && !hidden ? (
    <Pressable onPress={() => setMore(true)} accessibilityRole="button" accessibilityLabel="More for this list" className="items-center justify-center" style={{ width: hit.min, height: hit.min }}>
      <Icon name="ellipsis-horizontal" size={22} color={c.text} />
    </Pressable>
  ) : undefined;
  return (
    <>
      <PageHeader title="Shared list" {...(right ? { right } : {})} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-gap pb-24 gap-row">
        {list === undefined ? <Loader /> : list === null || hidden ? (
          <Text className="text-muted text-body">{hidden ? 'You reported this list. It is hidden for you.' : 'This list is gone, or the link is wrong.'}</Text>
        ) : (
          <>
            <Text className="text-text text-display font-display" accessibilityRole="header">{list.title}</Text>
            <Text className="text-muted text-meta">{`${list.shows.length} show${list.shows.length === 1 ? '' : 's'} · shared by ${list.owner.displayName}`}</Text>
            <Card>
              {list.shows.map((s, i) => (
                <Box key={s.feedUrl}>
                  {i > 0 ? <CardDivider /> : null}
                  <Pressable
                    onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })}
                    accessibilityRole="link" accessibilityLabel={`Open ${s.title}`}
                    className="flex-row items-center gap-row py-row" style={TAP}
                  >
                    <Artwork url={s.imageUrl} size={48} name={s.title} />
                    <Text className="flex-1 text-text text-body font-semibold" numberOfLines={2}>{s.title}</Text>
                    <Icon name="chevron-forward" size={18} color={c.muted} />
                  </Pressable>
                </Box>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
      <MoreSheet
        open={more}
        title={list ? list.title : ''}
        iconColour={c.accent}
        onClose={() => setMore(false)}
        rows={list ? [{ icon: 'flag-outline', label: 'Report this list', onPress: () => setReporting({ kind: 'list', id: list.id, authorId: list.owner.id, label: 'list' }) }] : []}
      />
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
    </>
  );
}
