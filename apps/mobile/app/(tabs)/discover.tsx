/** Discover (M5 US1): picks, listened-and-talked-about, chart trending; works signed out; stale offline; pull to refresh. */
import { RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';
import { useDiscover } from '../../src/discover/useDiscover';
import { DiscoverSections } from '../../src/ui/DiscoverSections';
import { colour, spacing } from '../../src/design';
import { BOTTOM_INSET } from '../../src/ui/Screen';

export default function DiscoverScreen(): React.ReactElement {
  const { view, refreshing, refresh, open } = useDiscover();
  return (
    <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}>
      {view ? <DiscoverSections body={view.body} stale={view.stale} fetchedAt={view.fetchedAt} onOpen={(c) => void open(c)} /> : <Text style={styles.muted}>{refreshing ? 'Loading…' : "Couldn't reach the server, and nothing is cached yet."}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ body: { padding: spacing.section, paddingBottom: BOTTOM_INSET }, muted: { color: colour.muted } });
