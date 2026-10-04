// Listening history by day, with where you stopped; filter to finished only.
/**
 * Listening history (收听历史, M10): what this phone played, most recent first, with where you stopped; search and "Only finished" as in the reference.
 *
 * M17 (`History-B`): the 32 pt serif title, the pill search box with "All / Only finished" as a
 * pill track under it, and the rows grouped by day under serif headings ("Today", "Yesterday",
 * "Earlier this week", "Earlier"), each group in a white card. A row shows the show and the
 * date, then a thin progress bar (yellow) with "Stopped at" / "Finished" beside it. Same rows,
 * same links, same spoken names.
 */
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { listeningHistory, matchesAll, type HistoryRow } from '@/me/history';
import { FilterBar } from '@/ui/me/FilterBar';
import { Artwork } from '@/ui/kit/Artwork';
import { Card, CardDivider } from '@/ui/kit/Card';
import { mmss, shortDate } from '@/ui/kit/format';
import { EmptyPicture } from '@/ui/me/parts';
import { useStores } from '@/ui/shell/providers';
import { size } from '@/design';
import { PageHeader } from '@/ui/kit/PageHeader';

const ROW = { minHeight: size.row };
const DAY = 24 * 60 * 60 * 1000;

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
  // The lag audit (2026-10-04): read once per visit, then filter on each key press — it re-read
  // the whole history (and every show) on every letter typed.
  const [visit, setVisit] = useState(0);
  useFocusEffect(useCallback(() => { setVisit((n) => n + 1); }, []));
  const all = useMemo(
    () => listeningHistory(stores).map((r) => ({ r, showTitle: stores.feeds.getShow(r.episode.feedUrl)?.title })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stores, visit],
  );
  const rows = useMemo(
    () => all.filter(({ r, showTitle }) => (!finished || r.finished) && matchesAll(term, [r.episode.title, showTitle])).map(({ r }) => r),
    [all, term, finished],
  );
  const groups = byDay(rows, Date.now());
  return (
    <>
    <PageHeader title="Listening history" />
    <FlatList
      className="flex-1 bg-background"
      data={groups}
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
                  <Link href={{ pathname: '/episode/[id]', params: { id: item.episode.id } }} asChild>
                    {/* M12 FR-050: a compact row (50 pt minimum); M17 adds the progress line. */}
                    <Pressable className="flex-row gap-row py-2.5 items-center" style={ROW} accessibilityRole="button" accessibilityLabel={`${item.episode.title}. ${where}`}>
                      <Artwork url={item.episode.imageUrl ?? show?.imageUrl} size={48} rounded="row" name={show?.title} />
                      <Box className="flex-1">
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
                </Box>
              );
            })}
          </Card>
        </Box>
      )}
    />
    </>
  );
}
