// A shared show list: its title, who shared it, its shows (each opens), and Report.
/**
 * Spec 039 (Detail template): a `DetailPage` (Back + the list's name, "n shows · shared by …" under it, More at its end); the shows are a `Section` of 56 tall row cards.
 *
 * M24 US1. Opened from a list link (`socialmorning://lists/<id>`, on the list's web page). Each
 * show opens its page. Someone else's list has More → Report: hidden for me at once, then sent to
 * Admin, which can remove it for everyone. A removed or unknown list says so.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Type } from '@/ui/kit/Type';
import { Box } from '@/ui/lib/box';
import { radius, spacing } from '@/design';
import { plural } from '@socialmorning/social-core';
import { DetailPage } from '@/ui/detail/DetailPage';
import { IconButton } from '@/ui/kit/PulseButton';
import { Section } from '@/ui/kit/layout';
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

/** A show row: 56 tall at least, its cover 40. */
const ROW = 56;
const COVER = 40;

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
    <IconButton icon="ellipsis-horizontal" label="More for this list" onPress={() => setMore(true)} fill />
  ) : undefined;
  return (
    <>
      <DetailPage title={list ? list.title : 'Shared list'} {...(right ? { trailing: right } : {})}>
        {list === undefined ? <Loader /> : list === null || hidden ? (
          <Type step="body" className="text-text2">{hidden ? 'You reported this list. It is hidden for you.' : 'This list is gone, or the link is wrong.'}</Type>
        ) : (
          <>
            <Type step="caption" className="text-text2">{`${plural(list.shows.length, 'show')} · shared by ${list.owner.displayName}`}</Type>
            <Section title="Shows">
              <Box style={{ gap: spacing.gap }}>
                {list.shows.map((s) => (
                  <Pressable
                    key={s.feedUrl}
                    onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })}
                    accessibilityRole="link" accessibilityLabel={`Open ${s.title}`}
                    className="flex-row items-center bg-raise" style={{ minHeight: ROW, gap: spacing.row, padding: spacing.row, borderRadius: radius.row }}
                  >
                    <Artwork url={s.imageUrl} size={COVER} name={s.title} />
                    <Type step="row" className="flex-1 text-text" numberOfLines={2}>{s.title}</Type>
                    <Icon name="chevron-forward" size={18} color={c.muted} />
                  </Pressable>
                ))}
              </Box>
            </Section>
          </>
        )}
      </DetailPage>
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
