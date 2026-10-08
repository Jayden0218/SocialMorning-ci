// Listening history by day, with where you stopped; filter to finished only.
/**
 * Listening history (收听历史, M10): what this phone played, most recent first, with where you stopped; search and "Only finished" as in the reference.
 *
 * M17 (`History-B`): the 32 pt serif title, the pill search box with "All / Only finished" as a
 * pill track under it, and the rows grouped by day under serif headings ("Today", "Yesterday",
 * "Earlier this week", "Earlier"), each group in a white card. A row shows the show and the
 * date, then a thin progress bar (yellow) with "Stopped at" / "Finished" beside it. Same rows,
 * same links, same spoken names.
 *
 * M21 US4 (FR-035): a long-press on a row opens the shared episode sheet (`EpisodeRowSheet`).
 *
 * M21 US10 (T110): ▶ Play, Share and the comment count (ONE comment-counts call for the first 100
 * rows). M24 US20 (`History-B`, ~68 pt rows): they moved into the row's ⋯ sheet (Play, Share,
 * "View comments (N)"); the two-line description is on the episode page the row opens.
 *
 * M22 US8 (FR-026): Select (top right) turns the rows into tick boxes; "Delete (N)" removes up to
 * 100 at once and "Clear all" (one confirm) empties history — on the account when signed in
 * (`DELETE /v1/me/history`, positions only: listening totals and stickers stay), and hidden on
 * this phone (`src/me/history.ts`). Opening the page also hides rows another phone deleted.
 *
 * M22 US16: on a tablet (`useOpensInPane`) a row opens its episode in the right pane
 * (src/ui/shell/ListDetail.tsx) instead of pushing the page; a phone is unchanged.
 */
import { Link, router } from 'expo-router';
import { EpisodePane, ListDetail, useOpensInPane } from '@/ui/shell/ListDetail';
import { useEffect, useState } from 'react';
import { HISTORY_DELETE_MAX, useM22LibraryApi } from '@/social/api-m22-library';
import { useConfirm } from '@/ui/kit/confirm';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hideDeletedElsewhere, hideFromHistory, listeningHistory, matchesAll, type HistoryRow } from '@/me/history';
import { FilterBar } from '@/ui/me/FilterBar';
import { Artwork } from '@/ui/kit/Artwork';
import { Card, CardDivider } from '@/ui/kit/Card';
import { mmss, shortDate } from '@/ui/kit/format';
import { EmptyPicture } from '@/ui/me/parts';
import { useStores, useToast } from '@/ui/shell/providers';
import { hit, size } from '@/design';
import { PageHeader } from '@/ui/kit/PageHeader';
import { EndOfList } from '@/ui/kit/EndOfList';
import { EpisodeRowSheet } from '@/ui/kit/EpisodeRowSheet';
import type { CachedEpisode } from '@/storage/types';
import { toPlayable } from '@/storage/playable';
import { usePlayer } from '@/playback/store';
import { useM12Api } from '@/social/m12-api';
import { Icon } from '@/ui/kit/Icon';
import { useColours } from '@/ui/kit/useColours';
import { plural } from '@socialmorning/social-core';

const ROW = { minHeight: size.row };
/** Select / Done and the row's ⋯: 48 pt targets. */
const TAP = { minHeight: hit.min, minWidth: hit.min };
const DAY = 24 * 60 * 60 * 1000;
const PILL = { minHeight: hit.min };
const NONE: ReadonlySet<string> = new Set();

/** The day heading a row falls under, counted in calendar days on this phone. */
function dayLabel(at: number, now: number): string {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  if (at >= today) return 'Today';
  if (at >= today - DAY) return 'Yesterday';
  if (at >= today - 6 * DAY) return 'Earlier this week';
  return 'Earlier';
}

/** Consecutive rows under one heading (the rows are newest first, so each label appears once). */
function byDay(rows: readonly HistoryRow[], now: number): { label: string; rows: HistoryRow[] }[] {
  const groups: { label: string; rows: HistoryRow[] }[] = [];
  for (const r of rows) {
    const label = dayLabel(r.updatedAt, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(r);
    else groups.push({ label, rows: [r] });
  }
  return groups;
}

export default function HistoryScreen(): React.ReactElement {
  const stores = useStores();
  const [term, setTerm] = useState('');
  const [finished, setFinished] = useState(false);
  const [menuFor, setMenuFor] = useState<CachedEpisode | undefined>();
  // M22 US8: select mode, the ticked rows, and a bump to re-read after a delete.
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(NONE);
  const [overLimit, setOverLimit] = useState(false);
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const m22 = useM22LibraryApi();
  const toast = useToast();
  const [confirm, dialog] = useConfirm();
  const signedIn = stores.auth.get() !== undefined;
  // Rows deleted on another phone: synced here, gone from the account → hidden here too.
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    m22.positionIds().then((ids) => { if (live && hideDeletedElsewhere(stores.settings, stores.positions.all(), ids, Date.now()) > 0) bump(); }, () => undefined);
    return () => { live = false; };
  }, [m22, stores, signedIn]);
  const rows = listeningHistory(stores).filter((r) => (!finished || r.finished) && matchesAll(term, [r.episode.title, stores.feeds.getShow(r.episode.feedUrl)?.title]));
  const groups = byDay(rows, Date.now());
  const player = usePlayer();
  const m12 = useM12Api();
  const c = useColours(stores.settings);
  // M21 US10: one comment-counts call for the rows on screen (≤ 100); a failure leaves them out.
  const [comments, setComments] = useState<Record<string, number>>({});
  const ids = rows.slice(0, 100).map((r) => r.episode.id).join(',');
  useEffect(() => {
    if (ids === '') return;
    let live = true;
    m12.episodeCounts(ids.split(',')).then((r) => { if (live) setComments(r.counts); }, () => undefined);
    return () => { live = false; };
  }, [m12, ids]);
  const play = (id: string) => { const p = toPlayable(stores, id); if (p) player.load(p, 'play'); };
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) { next.delete(id); setOverLimit(false); }
    else if (next.size >= HISTORY_DELETE_MAX) { setOverLimit(true); return; }
    else next.add(id);
    setChosen(next);
  };
  // M22 US16: on a tablet the row's link is stopped and the episode shows in the right pane.
  const inPane = useOpensInPane();
  const [paneId, setPaneId] = useState<string | undefined>(undefined);
  const toPane = (id: string) => (e: { preventDefault: () => void }) => { if (!inPane) return; e.preventDefault(); setPaneId(id); };
  const leaveSelect = () => { setSelecting(false); setChosen(NONE); setOverLimit(false); };
  /** On the account first (when signed in), then hidden here; a failed call still hides it here. */
  const remove = async (what: { episodeIds: readonly string[] } | { all: true }, ids: readonly string[]) => {
    let synced = true;
    if (signedIn) await m22.deleteHistory(what).catch(() => { synced = false; });
    hideFromHistory(stores.settings, ids, Date.now());
    leaveSelect();
    bump();
    toast(synced ? ('all' in what ? 'History cleared.' : `${plural(ids.length, 'item')} deleted.`) : "Deleted on this phone. Couldn't reach the server — other devices still show it.");
  };
  const deleteChosen = () => { const ids = [...chosen]; if (ids.length > 0) void remove({ episodeIds: ids }, ids); };
  const clearAll = () => confirm({
    title: 'Clear all listening history?',
    message: 'History is emptied on all your signed-in devices. Your listening time and stickers stay.',
    action: 'Clear all',
    onConfirm: () => { void remove({ all: true }, stores.positions.all().map((p) => p.episodeId)); },
  });
  return (
    <>
    <PageHeader
      title="Listening history"
      right={rows.length > 0 || selecting ? (
        <Pressable onPress={selecting ? leaveSelect : () => setSelecting(true)} accessibilityRole="button" accessibilityLabel={selecting ? 'Done' : 'Select'} className="items-center justify-center px-2" style={TAP}>
          <Text className="text-accent text-body font-bold">{selecting ? 'Done' : 'Select'}</Text>
        </Pressable>
      ) : undefined}
    />
    <ListDetail
      placeholder="Choose an episode to see it here."
      detail={paneId !== undefined ? <EpisodePane episodeId={paneId} onOpenPage={() => router.push({ pathname: '/episode/[id]', params: { id: paneId } })} /> : undefined}
      list={
    <FlatList
      className="flex-1 bg-background"
      data={groups}
      // Owner, 2026-10-05: the bottom of a fetched list says so.
      ListFooterComponent={groups.length > 0 ? <EndOfList /> : undefined}
      keyExtractor={(g) => g.label}
      contentContainerClassName="px-screen-x pb-24 flex-grow"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={<FilterBar term={term} onTerm={setTerm} placeholder="Search your history" toggle={{ label: 'Only finished', value: finished, onChange: setFinished }} />}
      ListEmptyComponent={<EmptyPicture icon="time-outline" line={term || finished ? 'Nothing matches' : 'Nothing played yet'} />}
      renderItem={({ item: group }) => (
        <Box className="mt-1 mb-row">
          <Text className="text-text text-base font-display-semibold mb-2" accessibilityRole="header">{group.label}</Text>
          <Card>
            {group.rows.map((item, i) => {
              const show = stores.feeds.getShow(item.episode.feedUrl);
              const where = item.finished ? 'Finished' : `Stopped at ${mmss(item.offsetMs)}`;
              const duration = item.episode.durationMs;
              const done = item.finished ? 1 : duration !== undefined && duration > 0 ? Math.min(1, item.offsetMs / duration) : undefined;
              return (
                <Box key={item.episode.id}>
                  {i > 0 ? <CardDivider /> : null}
                  {selecting ? (
                    // Defect 2 (2026-10-07): a button with the Selected trait ("checkbox" has no iOS
                    // trait, so the rows were missing from the accessibility tree), and the whole row —
                    // the tick circle too — is one touch target: nothing inside takes the touch.
                    <Pressable onPress={() => toggle(item.episode.id)} accessibilityRole="button" accessibilityState={{ selected: chosen.has(item.episode.id) }} accessibilityLabel={`Select ${item.episode.title}`} className="flex-row py-2.5 items-center self-stretch" style={ROW} hitSlop={{ left: 8, right: 8 }}>
                      <Box pointerEvents="none" className="flex-1 flex-row gap-row items-center">
                        <Icon name={chosen.has(item.episode.id) ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={chosen.has(item.episode.id) ? c.accent : c.muted} />
                        <Artwork url={item.episode.imageUrl ?? show?.imageUrl} size={48} name={show?.title} />
                        <Box className="flex-1 min-w-0">
                          <Text className="text-text text-body font-semibold" numberOfLines={1}>{item.episode.title}</Text>
                          <Text className="text-muted text-xs mt-0.5" numberOfLines={1}>{[show?.title, where].filter(Boolean).join(' · ')}</Text>
                        </Box>
                      </Box>
                    </Pressable>
                  ) : (
                  // M24 US20 (`History-B`): a ~68 pt row — cover, title, show · date, progress line.
                  // M21 US10's extras moved, nothing lost: ▶ Play, Share and "View comments (N)" are in
                  // the row's ⋯ sheet (the same sheet a long-press opens); the description is on the
                  // episode page the row opens.
                  <Box className="flex-row items-center">
                  <Link href={{ pathname: '/episode/[id]', params: { id: item.episode.id } }} asChild onPress={toPane(item.episode.id)}>
                    {/* M12 FR-050: a compact row (50 pt minimum); M17 adds the progress line. */}
                    <Pressable className="flex-1 flex-row gap-row py-2.5 items-center" style={ROW} accessibilityRole="button" accessibilityLabel={`${item.episode.title}. ${where}`} onLongPress={() => setMenuFor(item.episode)} accessibilityHint="Long-press for more actions">
                      <Artwork url={item.episode.imageUrl ?? show?.imageUrl} size={48} name={show?.title} />
                      <Box className="flex-1 min-w-0">
                        <Text className="text-text text-body font-semibold" numberOfLines={1}>{item.episode.title}</Text>
                        <Text className="text-muted text-xs mt-0.5" numberOfLines={1}>{[show?.title, shortDate(item.updatedAt)].filter(Boolean).join(' · ')}</Text>
                        <Box className="flex-row items-center gap-2 mt-1.5">
                          {done !== undefined ? (
                            <Box className="flex-1 h-1 rounded-pill bg-track overflow-hidden">
                              <Box className="h-1 bg-primary" style={{ width: `${Math.round(done * 100)}%` }} />
                            </Box>
                          ) : <Box className="flex-1" />}
                          <Text className="text-muted text-micro">{where}</Text>
                        </Box>
                      </Box>
                    </Pressable>
                  </Link>
                  <Pressable onPress={() => setMenuFor(item.episode)} accessibilityRole="button" accessibilityLabel={`More for ${item.episode.title}`} className="items-center justify-center -mr-2" style={TAP}>
                    <Icon name="ellipsis-horizontal" size={18} color={c.muted} />
                  </Pressable>
                  </Box>
                  )}
                </Box>
              );
            })}
          </Card>
        </Box>
      )}
    />
      }
    />
    {selecting ? (
      <Box className="px-screen-x pt-row pb-row gap-2 bg-background border-t-hairline border-separator">
        {overLimit ? <Text className="text-muted text-xs" accessibilityLiveRegion="polite">{`You can delete up to ${HISTORY_DELETE_MAX} at a time.`}</Text> : null}
        <Box className="flex-row gap-gap">
          <Pressable onPress={clearAll} accessibilityRole="button" accessibilityLabel="Clear all" className="flex-1 items-center justify-center rounded-pill bg-surface border border-border" style={PILL}>
            <Text className="text-accent text-body font-bold">Clear all</Text>
          </Pressable>
          <Pressable
            onPress={chosen.size > 0 ? deleteChosen : undefined}
            disabled={chosen.size === 0}
            accessibilityRole="button"
            accessibilityLabel={`Delete (${chosen.size})`}
            accessibilityState={{ disabled: chosen.size === 0 }}
            className={`flex-1 items-center justify-center rounded-pill bg-primary ${chosen.size === 0 ? 'opacity-40' : ''}`}
            style={PILL}
          >
            <Text className="text-onPrimary text-body font-bold">{`Delete (${chosen.size})`}</Text>
          </Pressable>
        </Box>
      </Box>
    ) : null}
    {dialog}
    <EpisodeRowSheet
      episode={menuFor ? { id: menuFor.id, title: menuFor.title, feedUrl: menuFor.feedUrl, imageUrl: menuFor.imageUrl ?? stores.feeds.getShow(menuFor.feedUrl)?.imageUrl } : undefined}
      onClose={() => setMenuFor(undefined)}
      comments={menuFor ? comments[menuFor.id] : undefined}
      actions={menuFor ? [{ icon: 'play', label: 'Play', onPress: () => { const id = menuFor.id; setMenuFor(undefined); play(id); } }] : []}
    />
    </>
  );
}
