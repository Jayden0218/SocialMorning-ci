/**
 * New clip (M4 US1). Opened from the player's Clip button with the episode and the
 * moment. Save → `clips.create` → sent (Share offered) or pending ("sending" on the
 * episode) or needs sign-in.
 */
import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useGraph } from '../../src/graph/context';
import { useSocial } from '../../src/social/context';
import { useStores, useToast } from '../../src/ui/providers';
import { toPlayable } from '../../src/storage/playable';
import { ClipComposer } from '../../src/ui/ClipComposer';
import { shareClip } from '../../src/graph/share';
import { apiBaseUrl } from '../../src/social/base-url';

export default function NewClipScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ episodeId: string; positionMs: string }>();
  const stores = useStores();
  const { clips } = useGraph();
  const { listener } = useSocial();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const episode = params.episodeId ? toPlayable(stores, params.episodeId) : undefined;
  if (!episode) return <View style={styles.body}><Text>This episode is not in the library.</Text></View>;
  if (!listener) return <View style={styles.body}><Text>Sign in to make a clip.</Text></View>;
  return (
    <ClipComposer
      episode={episode}
      initialPositionMs={Number(params.positionMs ?? 0)}
      saving={saving}
      onSave={async (s) => {
        setSaving(true);
        const r = await clips.create(episode.id, s.range, s.caption, episode.durationMs);
        setSaving(false);
        if (r.kind === 'sent') {
          router.back();
          await shareClip(Share, r.clip, episode.title, apiBaseUrl());
        } else if (r.kind === 'pending') {
          toast('Clip saved — it will be sent when you are online.');
          router.back();
        } else if (r.kind === 'needsSignIn') {
          toast('Sign in to make a clip.');
        } else {
          toast(`That range can't be a clip (${r.reason}).`);
        }
      }}
    />
  );
}

const styles = StyleSheet.create({ body: { padding: 16 } });
