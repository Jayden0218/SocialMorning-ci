/** Curated issues (M12 FR-101): every issue so far, newest first; each opens its numbered picks. */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList } from '../src/ui/lib/flat-list';
import { Pressable } from '../src/ui/lib/pressable';
import { Text } from '../src/ui/lib/text';
import { Box } from '../src/ui/lib/box';
import { size, hit } from '../src/design';
import { Loader } from '../src/ui/Loader';
import { Icon } from '../src/ui/Icon';
import { EmptyPicture } from '../src/ui/me/parts';
import { dayTitle } from '../src/discover/sections';
import { useColours } from '../src/ui/useColours';
import { useStores } from '../src/ui/providers';
import { useM12Api, type IssueSummary } from '../src/social/m12-api';

const ROW = { minHeight: size.row };
const TAP = { minHeight: hit.min };
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; issues: IssueSummary[] };

export default function IssuesScreen(): React.ReactElement {
  const router = useRouter();
  const m12 = useM12Api();
  const c = useColours(useStores().settings);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(() => {
    setState({ kind: 'loading' });
    m12.issues().then((issues) => setState({ kind: 'ok', issues }), () => setState({ kind: 'error' }));
  }, [m12]);
  useEffect(() => { load(); }, [load]);
  return (
    <FlatList
      className="flex-1 bg-background"
      data={state.kind === 'ok' ? state.issues : []}
      keyExtractor={(i) => i.id}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow"
      ListEmptyComponent={state.kind === 'loading' ? <Loader className="my-section" /> : state.kind === 'error' ? (
        <Box className="items-center my-section">
          <Text className="text-muted text-sm">Couldn't load the issues right now.</Text>
          <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center" style={TAP}><Text className="text-accent text-sm font-semibold">Retry</Text></Pressable>
        </Box>
      ) : <EmptyPicture icon="newspaper-outline" line="No issues yet" />}
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push({ pathname: '/issue/[id]', params: { id: item.id } })} accessibilityRole="button" accessibilityLabel={`${item.title}, ${dayTitle(item.date)}`}
          className="flex-row items-center gap-row border-b-hairline border-separator" style={ROW}>
          <Box className="flex-1">
            <Text className="text-text text-sm font-semibold" numberOfLines={2}>{item.title}</Text>
            <Text className="text-muted text-xs">{dayTitle(item.date)}</Text>
          </Box>
          <Icon name="chevron-forward" size={18} color={c.muted} />
        </Pressable>
      )}
    />
  );
}
