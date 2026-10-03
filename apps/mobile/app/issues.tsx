/**
 * Curated issues (M12 FR-101): every issue so far, newest first; each opens its numbered picks.
 *
 * M17 T096 (`Issues-B`): the serif page title with a subtitle line; the newest issue is a
 * yellow lead card ("Latest · date", its serif title, "Read this issue ›"); the rest sit
 * under "Earlier issues" as a 2-column grid of white cards — a short accent strip, the serif
 * title, the date at the foot. Every card is the same Pressable as before (same accessible
 * name, same `/issue/[id]` push); loading, Retry and the empty picture are unchanged.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit, spacing } from '@/design';
import { Loader } from '@/ui/Loader';
import { Icon } from '@/ui/Icon';
import { EmptyPicture } from '@/ui/me/parts';
import { dayTitle } from '@/discover/sections';
import { useColours } from '@/ui/useColours';
import { useStores } from '@/ui/providers';
import { useM12Api, type IssueSummary } from '@/social/m12-api';
import { PageHeader } from '@/ui/PageHeader';

const TAP = { minHeight: hit.min };
const COLUMNS = { gap: spacing.row };
/** `Issues-B`: a grid card is at least 132 pt tall, so the dates line up along a row. */
const CARD_MIN = 132;
const CAPS = { letterSpacing: 1.3, textTransform: 'uppercase' as const };
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; issues: IssueSummary[] };

export default function IssuesScreen(): React.ReactElement {
  const router = useRouter();
  const m12 = useM12Api();
  const c = useColours(useStores().settings);
  const { width } = useWindowDimensions();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(() => {
    setState({ kind: 'loading' });
    m12.issues().then((issues) => setState({ kind: 'ok', issues }), () => setState({ kind: 'error' }));
  }, [m12]);
  useEffect(() => { load(); }, [load]);

  const issues = state.kind === 'ok' ? state.issues : [];
  const lead = issues[0];
  const cell = Math.max(0, Math.floor((width - 2 * spacing.screenX - spacing.row) / 2));
  const cellBox = { width: cell, minHeight: CARD_MIN };

  /** One issue: the yellow lead card (the newest) or a grid card. Same name and push for both. */
  const issueCard = (item: IssueSummary, isLead: boolean): React.ReactElement => (
    <Pressable
      onPress={() => router.push({ pathname: '/issue/[id]', params: { id: item.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${dayTitle(item.date)}`}
      className={isLead ? 'bg-primary rounded-artwork-lg p-5 gap-gap' : 'bg-surface border border-border rounded-row p-row gap-1.5 mb-row'}
      style={isLead ? TAP : cellBox}
    >
      {isLead ? (
        <>
          <Text className="text-onPrimary text-micro font-bold" style={CAPS} numberOfLines={1}>Latest · {dayTitle(item.date)}</Text>
          <Text className="text-onPrimary text-lg font-display" numberOfLines={4}>{item.title}</Text>
          <Box className="flex-row items-center gap-1 mt-1.5">
            <Text className="text-onPrimary text-body font-bold">Read this issue</Text>
            <Icon name="chevron-forward" size={16} color={c.onPrimary} />
          </Box>
        </>
      ) : (
        <>
          <Box className="h-1.5 w-8 rounded-pill bg-accentTint" accessible={false} importantForAccessibility="no-hide-descendants" />
          <Text className="text-text text-body font-display-semibold" numberOfLines={4}>{item.title}</Text>
          <Text className="text-muted text-micro mt-auto">{dayTitle(item.date)}</Text>
        </>
      )}
    </Pressable>
  );

  return (
    <>
    <PageHeader title="Issues" subtitle="Every issue so far, newest first." />
    <FlatList
      className="flex-1 bg-background"
      data={issues.slice(1)}
      keyExtractor={(i) => i.id}
      numColumns={2}
      columnWrapperStyle={COLUMNS}
      contentContainerClassName="px-screen-x pb-24 flex-grow"
      ListHeaderComponent={lead ? (
        <Box>
          {issueCard(lead, true)}
          {issues.length > 1 ? <Text className="text-text text-base font-display-semibold mt-5 mb-2.5" accessibilityRole="header">Earlier issues</Text> : null}
        </Box>
      ) : undefined}
      ListEmptyComponent={issues.length > 0 ? undefined : state.kind === 'loading' ? <Loader className="my-section" /> : state.kind === 'error' ? (
        <Box className="items-center my-section">
          <Text className="text-muted text-sm">Couldn't load the issues right now.</Text>
          <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center" style={TAP}><Text className="text-accent text-sm font-semibold">Retry</Text></Pressable>
        </Box>
      ) : <EmptyPicture icon="newspaper-outline" line="No issues yet" />}
      renderItem={({ item }) => issueCard(item, false)}
    />
    </>
  );
}
