/**
 * New clip (M4 US1). Opened from the player's Clip button with the episode and the
 * moment. Save → `clips.create` → sent (Share offered) or pending ("sending" on the
 * episode) or needs sign-in.
 *
 * M17 (`ClipNew-B`): the page is the serif "New clip" header over the rebuilt composer
 * (range card, Start / End cards, caption, Preview + Save bar at the foot — see
 * `ClipComposer`). The save flow below is unchanged.
 */
import { useState } from 'react';
import { Share } from 'react-native';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { router, useLocalSearchParams } from 'expo-router';
import { useGraph } from '@/graph/context';
import { useSocial } from '@/social/context';
import { useStores, useToast } from '@/ui/providers';
import { toPlayable } from '@/storage/playable';
import { ClipComposer } from '@/ui/ClipComposer';
import { shareClip } from '@/graph/share';
import { apiBaseUrl } from '@/social/base-url';
import { useSharePanel } from '@/ui/ShareChooser';
import { PageHeader } from '@/ui/PageHeader';

export default function NewClipScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ episodeId: string; positionMs: string }>();
  const stores = useStores();
  const { clips } = useGraph();
  const { listener } = useSocial();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  // M16a T005 (FR-015): after a save the app's share panel opens here; closing it goes back.
  const [share, sharePanel] = useSharePanel();
  const episode = params.episodeId ? toPlayable(stores, params.episodeId) : undefined;
  if (!episode) return <><PageHeader title="New clip" /><Box className="flex-1 bg-background px-screen-x"><Text className="text-text text-body">This episode is not in the library.</Text></Box></>;
  if (!listener) return <><PageHeader title="New clip" /><Box className="flex-1 bg-background px-screen-x"><Text className="text-text text-body">Sign in to make a clip.</Text></Box></>;
  return (
    <>
    <PageHeader title="New clip" />
    <ClipComposer
      episode={episode}
      initialPositionMs={Number(params.positionMs ?? 0)}
      saving={saving}
      onSave={async (s) => {
        setSaving(true);
        const r = await clips.create(episode.id, s.range, s.caption, episode.durationMs);
        setSaving(false);
        if (r.kind === 'sent') {
          const clip = r.clip;
          share({ heading: 'Clip saved — share it', more: { detail: 'other apps', run: () => void shareClip(Share, clip, episode.title, apiBaseUrl()) }, onClosed: () => router.back() });
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
    {sharePanel}
    </>
  );
}

