/** "Next up" on the episode page (M5 FR-008): 3–8 episodes with a reason each; hidden when there is nothing to show. */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { enoughNextUp } from '@socialmorning/social-core';
import { useSocial } from '../social/context';
import { ApiError, type EpisodeCard, type NextUpItem } from '../social/api';
import { EpisodeRow } from './EpisodeRow';

export function useNextUp(episodeId: string | undefined): { items: NextUpItem[] | undefined; status: 'loading' | 'ok' | 'none' } {
  const { api } = useSocial();
  const [items, setItems] = useState<NextUpItem[] | undefined>();
  const [status, setStatus] = useState<'loading' | 'ok' | 'none'>('loading');
  useEffect(() => {
    let live = true;
    setItems(undefined); setStatus('loading');
    if (!episodeId) { setStatus('none'); return; }
    api.nextUp(episodeId).then((r) => { if (live) { setItems(r.items); setStatus('ok'); } }).catch((e: unknown) => {
      if (!live) return;
      setStatus('none');
      if (!(e instanceof ApiError)) return; // 404 (unregistered) or offline: the block is simply absent
    });
    return () => { live = false; };
  }, [api, episodeId]);
  return { items, status };
}

export function NextUp(props: { items: NextUpItem[] | undefined; onOpen: (card: EpisodeCard) => void }): React.ReactElement | null {
  if (!props.items || !enoughNextUp(props.items)) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.h2}>Next up</Text>
      {props.items.map((i) => <EpisodeRow key={i.episode.id} card={i.episode} line={i.label} onPress={() => props.onOpen(i.episode)} />)}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { marginTop: 16 }, h2: { fontSize: 18, fontWeight: '600', marginBottom: 4 } });
