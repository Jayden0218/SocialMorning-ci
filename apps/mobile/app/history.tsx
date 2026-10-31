// Listening history by day on a spine, with where you stopped; filter to finished only, search, select and delete.
/**
 * Listening history (收听历史, M10): what this phone played, most recent first, with where you stopped; search and "Only finished" as in the reference.
 *
 * M31 W3-C (T041; design-pulse2 `listen.html` `history--screen`, `history--empty`, `history--select-mode`,
 * `history--clear-dialog`, `history--episode-sheet`, `toast--history`; layout pattern Thread): the rows hang from the
 * spine at x 40 under light day tags (TODAY, YESTERDAY, EARLIER THIS WEEK, EARLIER). A row is a raise card (radius 18):
 * cover 44, title, show, and a 34 play dot — or "Finished" in green when it is done; an unfinished one shows its played
 * curve (40 bars) and "Stopped at m:ss". The title bar is low (rule 1) and 26 wide: "Listening history", "All · 42
 * episodes", a search circle and a select (check) circle; the chips "All" and "Only finished" sit above it. Tap a card =
 * play from where you stopped (a tablet opens it in the right pane); long-press = the shared episode sheet ("More for
 * …", also the card's `longpress` accessibility action) whose Details tile opens the episode page. Select mode turns
 * the title bar into "n selected" with Clear all, Delete (n) and Done, and a tick circle on the spine beside each card.
 * Same rows, same spoken names, same toasts.
 *
 * M21 US4 (FR-035): a long-press on a row opens the shared episode sheet (`EpisodeRowSheet`).
 * M21 US10 (T110) / M24 US20: ▶ Play, Share and "View comments (N)" are in that sheet (ONE comment-counts call for the first 100 rows).
 * M22 US8 (FR-026): Select turns the rows into tick boxes; "Delete (N)" removes up to 100 at once and "Clear all" (one
 * confirm) empties history — on the account when signed in (`DELETE /v1/me/history`, positions only), and hidden on this
 * phone (`src/me/history.ts`). Opening the page also hides rows another phone deleted.
 * M22 US16: on a tablet (`useOpensInPane`) a row opens its episode in the right pane (src/ui/shell/ListDetail.tsx).
 *
 * Not as drawn: the rows show no per-episode heat (History keeps none), so the curve is an even meter; the spine is fixed
 * over the page, not part of the scrolling list (a long list is virtualised).
 */
import { router, useFocusEffect } from 'expo-router';
import { EpisodePane, ListDetail, useOpensInPane } from '@/ui/shell/ListDetail';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HISTORY_DELETE_MAX, useM22LibraryApi } from '@/social/api-m22-library';
import { useConfirm } from '@/ui/kit/confirm';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { hideDeletedElsewhere, hideFromHistory, listeningHistory, matchesAll, type HistoryRow } from '@/me/history';
import { Artwork } from '@/ui/kit/Artwork';
import { Chip } from '@/ui/kit/Chip';
import { mmss } from '@/ui/kit/format';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { PushedPage } from '@/ui/kit/PushedPage';
import { useStores, useToast } from '@/ui/shell/providers';
import { colour, hit, spacing } from '@/design';
import { EndOfList } from '@/ui/kit/EndOfList';
import { EpisodeRowSheet } from '@/ui/kit/EpisodeRowSheet';
import type { CachedEpisode } from '@/storage/types';
import { toPlayable } from '@/storage/playable';
import { usePlayer } from '@/playback/store';
import { useM12Api } from '@/social/m12-api';
import { plural } from '@socialmorning/social-core';
import { ME_TYPE } from '@/ui/me/measures';
import { DayTag, DRAWN, KeyboardPage, EmptySpine, LIST, PageEmpty, PlayDot, PlayedBars, SearchField, ThreadCard, ThreadNode, ThreadSpine, threadPad } from '@/ui/me/lists';

const DAY = 24 * 60 * 60 * 1000;
const NONE: ReadonlySet<string> = new Set();
/** The chips row is 36; the search field above it 48; the select bar's buttons 48. */
const CHIPS = 36;
/** The words under the select bar ("You can delete up to 100 at a time."): one 13/18 line and its gap. */
const LIMIT_LINE = 18 + spacing.gap;

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
  const [searching, setSearching] = useState(false);
  const [finished, setFinished] = useState(false);
  const [menuFor, setMenuFor] = useState<CachedEpisode | undefined>();
  // M22 US8: select mode, the ticked rows, and a bump to re-read after a delete.
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(NONE);
  const [overLimit, setOverLimit] = useState(false);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const m22 = useM22LibraryApi();
  const toast = useToast();
  const [confirm, dialog] = useConfirm();
  // M32 T091: the sign-in and each row's show are read with the history (the `version` bump), not on every render.
  const signedIn = useMemo(() => stores.auth.get() !== undefined, [stores, version]); // eslint-disable-line react-hooks/exhaustive-deps
  // Rows deleted on another phone: synced here, gone from the account → hidden here too.
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    m22.positionIds().then((ids) => { if (live && hideDeletedElsewhere(stores.settings, stores.positions.all(), ids, Date.now()) > 0) bump(); }, () => undefined);
    return () => { live = false; };
  }, [m22, stores, signedIn]);
  // The lag audit (2026-10-04, branch perf): read once per visit (and after a delete), then filter
  // on each key press — it re-read the whole history (and every show) on every letter typed.
  useFocusEffect(useCallback(() => { bump(); }, []));
  const all = useMemo(
    () => listeningHistory(stores).map((r) => ({ r, show: stores.feeds.getShow(r.episode.feedUrl) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stores, version],
  );
  const showOf = useMemo(() => new Map(all.map(({ r, show }) => [r.episode.id, show])), [all]);
  const rows = useMemo(
    () => all.filter(({ r, show }) => (!finished || r.finished) && matchesAll(term, [r.episode.title, show?.title])).map(({ r }) => r),
    [all, term, finished],
  );
  const groups = byDay(rows, Date.now());
  const player = usePlayer();
  const m12 = useM12Api();
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
  // M22 US16: on a tablet the episode shows in the right pane; a phone plays it from where it stopped.
  const inPane = useOpensInPane();
  const [paneId, setPaneId] = useState<string | undefined>(undefined);
  const openRow = (id: string) => { if (inPane) setPaneId(id); else play(id); };
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

  const subtitle = `${finished ? 'Only finished' : 'All'} · ${plural(rows.length, 'episode')}`;
  const actions = selecting ? [] : [
    { icon: 'search-outline' as const, label: 'Search your history', onPress: () => { if (searching) setTerm(''); setSearching(!searching); } },
    ...(rows.length > 0 ? [{ icon: 'checkmark' as const, label: 'Select', onPress: () => setSelecting(true) }] : []),
  ];
  const extra = selecting ? (
    <Box style={{ gap: spacing.gap }}>
      {overLimit ? <Type step="caption" className="text-text2" accessibilityLiveRegion="polite">{`You can delete up to ${HISTORY_DELETE_MAX} at a time.`}</Type> : null}
      <Box className="flex-row" style={{ gap: spacing.row - 2 }}>
        <Pressable onPress={clearAll} accessibilityRole="button" accessibilityLabel="Clear all" className="flex-1 bg-raise items-center justify-center rounded-pill" style={{ height: hit.min, paddingHorizontal: spacing.row - 2 }}>
          <Type step="row" className="text-hotText" numberOfLines={1}>Clear all</Type>
        </Pressable>
        <Pressable
          onPress={chosen.size > 0 ? deleteChosen : undefined}
          disabled={chosen.size === 0}
          accessibilityRole="button"
          accessibilityLabel={`Delete (${chosen.size})`}
          accessibilityState={{ disabled: chosen.size === 0 }}
          className={`flex-1 bg-hot items-center justify-center rounded-pill ${chosen.size === 0 ? 'opacity-40' : ''}`}
          style={{ height: hit.min, paddingHorizontal: spacing.row - 2 }}
        >
          <Type step="row" className="text-void" numberOfLines={1}>{`Delete (${chosen.size})`}</Type>
        </Pressable>
        <Pressable onPress={leaveSelect} accessibilityRole="button" accessibilityLabel="Done" className="bg-raise items-center justify-center rounded-pill" style={{ height: hit.min, paddingHorizontal: spacing.row + 2 }}>
          <Type step="row" className="text-text" numberOfLines={1}>Done</Type>
        </Pressable>
      </Box>
    </Box>
  ) : (
    <Box style={{ gap: spacing.gap }}>
      {searching ? <SearchField value={term} onChange={setTerm} placeholder="Search your history" autoFocus /> : null}
      <Box className="flex-row" style={{ gap: spacing.gap }}>
        <Chip label="All" chosen={!finished} onPress={() => setFinished(false)} />
        <Chip label="Only finished" chosen={finished} onPress={() => setFinished(true)} />
      </Box>
    </Box>
  );
  const extraAbove = selecting
    ? hit.min + (overLimit ? LIMIT_LINE : 0) + spacing.gap
    : CHIPS + (searching ? LIST.field + spacing.gap : 0) + spacing.gap;

  return (
    <KeyboardPage>
    <PushedPage
      title={selecting ? `${chosen.size} selected` : 'Listening history'}
      size={26}
      {...(selecting ? {} : { subtitle })}
      actions={actions}
      onBack={selecting ? null : undefined}
      extra={extra}
      extraAbove={extraAbove}
    >
      {(layout) => (
        <Box className="flex-1" style={{ paddingTop: layout.top + (DRAWN.listTop - DRAWN.status) }}>
          {groups.length === 0 ? <EmptySpine top={layout.top + (LIST.emptySpineTop - DRAWN.status)} /> : <ThreadSpine top={layout.top + (DRAWN.listTop - DRAWN.status)} />}
          <ListDetail
            placeholder="Choose an episode to see it here."
            detail={paneId !== undefined ? <EpisodePane episodeId={paneId} onOpenPage={() => router.push({ pathname: '/episode/[id]', params: { id: paneId } })} /> : undefined}
            list={
              <FlatList
                className="flex-1"
                data={groups}
                // Owner, 2026-10-05: the bottom of a fetched list says so.
                ListFooterComponent={groups.length > 0 ? <EndOfList /> : undefined}
                keyExtractor={(g) => g.label}
                contentContainerStyle={{ ...threadPad(layout.reserve), flexGrow: 1 }}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <PageEmpty
                    top={LIST.emptyBlockTop - DRAWN.listTop - LIST.top}
                    title={term || finished ? 'Nothing matches' : 'Nothing played yet'}
                    {...(term || finished ? {} : { line: 'Choose an episode to see it here.' })}
                  />
                }
                ItemSeparatorComponent={() => <Box style={{ height: LIST.historyGap }} />}
                renderItem={({ item: group }) => (
                  <ThreadNode grow lead={<DayTag text={group.label} />}>
                    <Box style={{ gap: spacing.row - 2 }}>
                      {group.rows.map((item) => {
                        const show = showOf.get(item.episode.id);
                        const where = item.finished ? 'Finished' : `Stopped at ${mmss(item.offsetMs)}`;
                        const duration = item.episode.durationMs;
                        const done = item.finished ? 1 : duration !== undefined && duration > 0 ? Math.min(1, item.offsetMs / duration) : 0;
                        const card = (
                          <ThreadCard>
                            <Box className="flex-row items-center" style={{ gap: spacing.row - 2 }}>
                              <Artwork url={item.episode.imageUrl ?? show?.imageUrl} size={LIST.cover} name={show?.title} />
                              <Box className="flex-1 min-w-0">
                                <Type step="compact" className="text-text" numberOfLines={1}>{item.episode.title}</Type>
                                <Type step="caption" className="text-text2" style={[ME_TYPE.show11, { marginTop: spacing.hair }]} numberOfLines={1}>{show?.title ?? ''}</Type>
                              </Box>
                              {item.finished ? <Type step="mono" className="text-ok" style={ME_TYPE.mono11}>Finished</Type> : <PlayDot size={LIST.playDot} />}
                            </Box>
                            {item.finished ? null : (
                              <Box className="flex-row items-center" style={{ gap: spacing.gap }}>
                                <Box className="flex-1"><PlayedBars share={done} /></Box>
                                <Type step="mono" className="text-text3" style={ME_TYPE.mono11}>{where}</Type>
                              </Box>
                            )}
                          </ThreadCard>
                        );
                        return selecting ? (
                          // Defect 2 (2026-10-07): a button with the Selected trait ("checkbox" has no iOS
                          // trait, so the rows were missing from the accessibility tree), and the whole row —
                          // the tick on the spine too — is one touch target: nothing inside takes the touch.
                          <Pressable key={item.episode.id} onPress={() => toggle(item.episode.id)} accessibilityRole="button" accessibilityState={{ selected: chosen.has(item.episode.id) }} accessibilityLabel={`Select ${item.episode.title}`} hitSlop={{ left: LIST.indent, top: 4, bottom: 4 }}>
                            <Box pointerEvents="none">
                              {card}
                              <Box
                                testID="history-tick"
                                className={chosen.has(item.episode.id) ? 'absolute items-center justify-center bg-hot' : 'absolute bg-void border-2 border-text'}
                                style={{ left: LIST.tickLeft, top: LIST.tickTop, width: LIST.tick, height: LIST.tick, borderRadius: LIST.tick / 2, zIndex: 3 }}
                              >
                                {chosen.has(item.episode.id) ? <Icon name="checkmark" size={14} color={colour.void} /> : null}
                              </Box>
                            </Box>
                          </Pressable>
                        ) : (
                          // M24 US20 (`History-B`): the row's extras (▶ Play, Share, "View comments (N)", Details) are in the
                          // shared episode sheet a long-press opens; "More for …" is also the card's `longpress` accessibility action.
                          <Pressable
                            key={item.episode.id}
                            onPress={() => openRow(item.episode.id)}
                            onLongPress={() => setMenuFor(item.episode)}
                            accessibilityRole="button"
                            accessibilityLabel={`${item.episode.title}. ${where}`}
                            accessibilityHint="Long-press for more actions"
                            accessibilityActions={[{ name: 'longpress', label: `More for ${item.episode.title}` }]}
                            onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') setMenuFor(item.episode); }}
                          >
                            {card}
                          </Pressable>
                        );
                      })}
                    </Box>
                  </ThreadNode>
                )}
              />
            }
          />
          {dialog}
          <EpisodeRowSheet
            episode={menuFor ? { id: menuFor.id, title: menuFor.title, feedUrl: menuFor.feedUrl, imageUrl: menuFor.imageUrl ?? stores.feeds.getShow(menuFor.feedUrl)?.imageUrl } : undefined}
            onClose={() => setMenuFor(undefined)}
            comments={menuFor ? comments[menuFor.id] : undefined}
            actions={menuFor ? [{ icon: 'play', label: 'Play', onPress: () => { const id = menuFor.id; setMenuFor(undefined); play(id); } }] : []}
          />
        </Box>
      )}
    </PushedPage>
    </KeyboardPage>
  );
}
