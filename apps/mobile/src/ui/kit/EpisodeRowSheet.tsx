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
 *
 * M31 W3-A (T040; design-pulse2 `episode--card-sheet`, layout Mosaic): the kit `ActionSheet` around `EpisodeSheetBody` (src/ui/episode) — the
 * episode's head (cover 64, the show as a link, the title), the six tiles of the Episode page's ⋯ sheet (Play next · Add to queue / Download ·
 * Add to favourites / Save this moment · Add to playlist), then one Panel group of rows: Details ("Open the episode page"), View comments (n),
 * Share, and a list's own actions after them; Cancel is the quiet pill. The tiles are the page's own (same names, toasts, second pages).
 */
import { reportAndDrop } from '@/telemetry/reportError';
import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { player } from '@/design/tokens';
import { PanelGroup } from '@/ui/me/Panel';
import { EpisodeSheetBody, SHEET_GAP } from '@/ui/episode/EpisodeSheetBody';
import { ShareChooser } from '@/ui/clips/ShareChooser';
import { useSocial } from '@/social/context';
import { useStores } from '@/ui/shell/providers';

export type RowSheetEpisode = { id: string; title: string; feedUrl: string; showTitle?: string | undefined; imageUrl?: string | undefined };
export type RowSheetAction = { icon: IconName; label: string; onPress: () => void; detail?: string };

/** "View comments (12)"; without a count, "View comments". */
export function commentsLabel(n: number | undefined): string {
  return n !== undefined && n > 0 ? `View comments (${n})` : 'View comments';
}

/** The sheet's tallest: the scroll view keeps Cancel reachable. */
const MAX = 0.8;
/** A Panel row: 56 tall at least, 14 of padding (`PanelRow`'s measures, drawn here so each row is one named button). */
const ROW = { minHeight: player.panelRow, paddingHorizontal: player.panelPad, gap: player.panelGap };

function SheetRows(props: { rows: readonly RowSheetAction[] }): React.ReactElement {
  const c = useColours();
  return (
    <PanelGroup>
      {props.rows.map((t) => (
        <Pressable key={t.label} onPress={t.onPress} accessibilityRole="button" accessibilityLabel={t.label} className="flex-row items-center" style={ROW}>
          <Icon name={t.icon} size={20} color={c.hotText} />
          <Box className="flex-1">
            <Type step="row" className="text-text" numberOfLines={1}>{t.label}</Type>
            {t.detail ? <Type step="tag" className="text-text3" numberOfLines={2}>{t.detail}</Type> : null}
          </Box>
          <Icon name="chevron-forward" size={16} color={c.text3} />
        </Pressable>
      ))}
    </PanelGroup>
  );
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
  const router = useRouter();
  const screen = useWindowDimensions();
  const { api } = useSocial();
  // Share opens after the sheet closes: two sheets are never open at once.
  const [sharing, setSharing] = useState<RowSheetEpisode | undefined>();
  const e = props.episode;
  const show = e ? stores.feeds.getShow(e.feedUrl) : undefined;
  const showTitle = e?.showTitle ?? show?.title;
  const go = (run: () => void) => { props.onClose(); run(); };
  const shared: RowSheetAction[] = e ? [
    { icon: 'document-text-outline', label: 'Details', detail: 'Open the episode page', onPress: () => go(() => router.push({ pathname: '/episode/[id]', params: { id: e.id } })) },
    { icon: 'chatbubble-ellipses-outline', label: commentsLabel(props.comments), onPress: () => go(() => router.push({ pathname: '/comments/[episodeId]', params: { episodeId: e.id } })) },
    { icon: 'share-outline', label: 'Share', onPress: () => go(() => setSharing(e)) },
  ] : [];
  const rows = [...shared, ...(props.actions ?? [])];
  return (
    <>
      <ActionSheet open={e !== undefined} onClose={props.onClose} label={e ? `More for ${e.title}` : 'More'}>
        {e ? (
          <ScrollView style={{ maxHeight: screen.height * MAX }} contentContainerStyle={{ gap: SHEET_GAP }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <EpisodeSheetBody
              episodeId={e.id}
              title={e.title}
              imageUrl={e.imageUrl ?? show?.imageUrl}
              showTitle={showTitle}
              onShow={showTitle ? () => go(() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(e.feedUrl) } })) : undefined}
              atMs={stores.positions.get(e.id)?.offsetMs ?? 0}
              heat={[]}
              durationMs={undefined}
              onQueued={() => stores.inboxState.mark(e.id, 'queued', Date.now())}
              onClose={props.onClose}
              rows={<SheetRows rows={rows} />}
            />
          </ScrollView>
        ) : null}
      </ActionSheet>
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
