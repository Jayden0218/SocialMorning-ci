// The one sheet every episode row opens from ⋯ or a long-press: cover header and episode actions.
/**
 * M21 US4 (FR-035, FR-036): one shared sheet for every episode list — the show page, Updates,
 * history, search and the chart. A long-press on a row, or its ⋯, opens it.
 *
 * Top: the episode's cover, the show's name as a link to its page, the title in the serif.
 * Then the tile grid (`SheetTile`, as the episode page's ⋯ sheet): View comments (N) and Details;
 * Share (the episode's own share chooser: link, this moment, picture); Play next and Add to queue
 * (`QueueButtons`); Download (`DownloadButton`); Favourite, Save this moment and Add to playlist
 * (`EpisodeExtras`). A list adds its own actions with `actions` (Updates: Remove from Updates,
 * Star this show). Cancel is an outlined pill.
 *
 * The episode must be in this phone's feed cache (the lists that open it are, or resolve the
 * card first) — queue, download and the player read it from there.
 */
import { reportAndDrop } from '@/telemetry/reportError';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper, ActionsheetScrollView } from '@/ui/lib/actionsheet';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { TAP } from '@/ui/kit/TopBar';
import { useColours } from '@/ui/kit/useColours';
import { SheetTile, TileRow, QueueButtons } from '@/ui/queue/QueueButtons';
import { DownloadButton } from '@/ui/episode/DownloadButton';
import { EpisodeExtras } from '@/ui/me/EpisodeExtras';
import { ShareChooser } from '@/ui/clips/ShareChooser';
import { useSocial } from '@/social/context';
import { useStores } from '@/ui/shell/providers';

export type RowSheetEpisode = { id: string; title: string; feedUrl: string; showTitle?: string | undefined; imageUrl?: string | undefined };
export type RowSheetAction = { icon: IconName; label: string; onPress: () => void; detail?: string };

/** "View comments (12)"; without a count, "View comments". */
export function commentsLabel(n: number | undefined): string {
  return n !== undefined && n > 0 ? `View comments (${n})` : 'View comments';
}

/** Pairs of tiles: the grid's rows (an odd last one keeps a blank half). */
export function pairs<T>(list: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += 2) out.push(list.slice(i, i + 2));
  return out;
}

export function EpisodeRowSheet(props: {
  episode: RowSheetEpisode | undefined;
  onClose: () => void;
  /** The episode's comment count, when the list has it. */
  comments?: number | undefined;
  /** A list's own actions, after the shared ones. */
  actions?: readonly RowSheetAction[];
}): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const router = useRouter();
  const { api } = useSocial();
  // Share opens after the sheet closes: two sheets are never open at once.
  const [sharing, setSharing] = useState<RowSheetEpisode | undefined>();
  const e = props.episode;
  const show = e ? stores.feeds.getShow(e.feedUrl) : undefined;
  const showTitle = e?.showTitle ?? show?.title;
  const go = (run: () => void) => { props.onClose(); run(); };
  const shared: RowSheetAction[] = e ? [
    { icon: 'chatbubble-ellipses-outline', label: commentsLabel(props.comments), onPress: () => go(() => router.push({ pathname: '/comments/[episodeId]', params: { episodeId: e.id } })) },
    { icon: 'document-text-outline', label: 'Details', onPress: () => go(() => router.push({ pathname: '/episode/[id]', params: { id: e.id } })) },
    { icon: 'share-outline', label: 'Share', onPress: () => go(() => setSharing(e)) },
  ] : [];
  const tiles = [...shared, ...(props.actions ?? [])];
  return (
    <>
      <Actionsheet isOpen={e !== undefined} onClose={props.onClose}>
        <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
        <ActionsheetContent className="bg-surface rounded-t-row px-screen-x pt-row max-h-[90%] items-stretch">
          <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
          {e ? (
            <ActionsheetScrollView className="grow-0">
              <Box className="flex-row items-center gap-row mt-gap mb-section">
                <Artwork url={e.imageUrl ?? show?.imageUrl} size={64} name={showTitle} />
                <Box className="flex-1">
                  {showTitle ? (
                    <Pressable
                      onPress={() => go(() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(e.feedUrl) } }))}
                      accessibilityRole="link"
                      accessibilityLabel={`Show: ${showTitle}`}
                      className="flex-row items-center gap-0.5 self-start justify-center"
                      style={TAP}
                    >
                      <Text className="text-accent text-xs font-bold flex-shrink" numberOfLines={1}>{showTitle}</Text>
                      <Icon name="chevron-forward" size={14} color={c.accent} />
                    </Pressable>
                  ) : null}
                  <Text className="text-text text-base font-display" numberOfLines={2}>{e.title}</Text>
                </Box>
              </Box>
              {pairs(tiles).map((row) => (
                <TileRow key={row.map((t) => t.label).join('|')}>
                  {row.map((t) => (
                    <SheetTile key={t.label} icon={t.icon} label={t.label} {...(t.detail ? { detail: t.detail } : {})} iconColour={c.accent} onPress={t.onPress} />
                  ))}
                  {row.length === 1 ? <Box className="flex-1" /> : null}
                </TileRow>
              ))}
              <QueueButtons episodeId={e.id} onQueued={() => stores.inboxState.mark(e.id, 'queued', Date.now())} />
              <DownloadButton episodeId={e.id} />
              <EpisodeExtras episodeId={e.id} atMs={stores.positions.get(e.id)?.offsetMs ?? 0} />
              <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Cancel" className="items-center justify-center mt-gap mb-row rounded-pill border border-border" style={TAP}>
                <Text className="text-accent text-body font-bold">Cancel</Text>
              </Pressable>
            </ActionsheetScrollView>
          ) : null}
        </ActionsheetContent>
      </Actionsheet>
      <ShareChooser
        open={sharing !== undefined}
        onClose={() => setSharing(undefined)}
        episode={{ id: sharing?.id ?? '', title: sharing?.title ?? '', showTitle: sharing?.showTitle ?? (sharing ? stores.feeds.getShow(sharing.feedUrl)?.title : undefined) ?? '' }}
        atMs={sharing ? stores.positions.get(sharing.id)?.offsetMs ?? 0 : 0}
        onClip={() => { if (sharing) router.push({ pathname: '/clip/new', params: { episodeId: sharing.id, positionMs: String(Math.round(stores.positions.get(sharing.id)?.offsetMs ?? 0)) } }); }}
        onShared={() => { if (sharing) void api.recordShare({ targetKind: 'episode', targetId: sharing.id, feedUrl: sharing.feedUrl }).catch(reportAndDrop('share.record')); }}
      />
    </>
  );
}
