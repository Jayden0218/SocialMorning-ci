// Make a clip from the player: pick start and end, add caption, save.
/**
 * New clip (M4 US1). Opened from the player's Clip button with the episode and the
 * moment (M22 US9: or from the transcript with `startMs`, `endMs`, `caption`). Save → `clips.create` → sent (Share offered) or pending ("sending" on the
 * episode) or needs sign-in.
 *
 * M17 (`ClipNew-B`): the page is the serif "New clip" header over the rebuilt composer
 * (range card, Start / End cards, caption, Preview + Save bar at the foot — see
 * `ClipComposer`). The save flow below is unchanged.
 *
 * M31 W3-B (T041; design-pulse2 `clip-new--screen`, `-signed-out`, `-episode-missing`, `-saved-share-panel`,
 * `toast--clip-new`): the composer is the Ring page (src/ui/clips/ClipComposer.tsx). Signed out: the shared empty
 * block — "Sign in to make a clip." — with a Sign in pill (to the existing sign-in); an episode that is not in the library:
 * a grey page with "This episode is not in the library." and Back only. Saved: the app's share panel, then back.
 */
import { useState } from 'react';
import { Box } from '@/ui/lib/box';
import { router, useLocalSearchParams } from 'expo-router';
import { useGraph } from '@/graph/context';
import { useSocial } from '@/social/context';
import { useStores, useToast } from '@/ui/shell/providers';
import { toPlayable } from '@/storage/playable';
import { ClipComposer } from '@/ui/clips/ClipComposer';
import { COMPOSER_EMPTY } from '@/ui/clips/measures';
import { useClipShare, useSharePanel } from '@/ui/clips/ShareChooser';
import { EmptyBlock } from '@/ui/chat/EmptyBlock';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';

export default function NewClipScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ episodeId: string; positionMs: string; startMs?: string; endMs?: string; caption?: string }>();
  // M22 US9 (research R8): from the transcript, the picked lines' range and words.
  const startMs = Number(params.startMs);
  const endMs = Number(params.endMs);
  const range = params.startMs !== undefined && params.endMs !== undefined && Number.isFinite(startMs) && Number.isFinite(endMs) ? { startMs, endMs } : undefined;
  const stores = useStores();
  const { clips } = useGraph();
  const { listener } = useSocial();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  // M16a T005 (FR-015): after a save the app's share panel opens here; closing it goes back.
  const [share, sharePanel] = useSharePanel();
  // F3: the clip's panel is the player's (chat, the chat apps, More, Share as video, Copy link).
  const clipShare = useClipShare();
  const episode = params.episodeId ? toPlayable(stores, params.episodeId) : undefined;
  if (!episode) {
    return (
      <PushedPage title="New clip" tone="grey">
        {(l) => <Box style={{ paddingTop: l.top + COMPOSER_EMPTY.missing }}><EmptyBlock title="Not in the library" line="This episode is not in the library." /></Box>}
      </PushedPage>
    );
  }
  if (!listener) {
    return (
      <PushedPage title="New clip">
        {(l) => (
          <Box style={{ paddingTop: l.top + COMPOSER_EMPTY.signedOut }}>
            <EmptyBlock title="Sign in to make a clip." line="Clips are yours to share; they need an account.">
              <PulseButton label="Sign in" onPress={() => router.push('/auth/sign-in')} />
            </EmptyBlock>
          </Box>
        )}
      </PushedPage>
    );
  }
  return (
    <>
    <ClipComposer
      episode={episode}
      initialPositionMs={Number(params.positionMs ?? range?.endMs ?? 0)}
      {...(range ? { initialRange: range } : {})}
      {...(params.caption ? { initialCaption: params.caption } : {})}
      saving={saving}
      onSave={async (s) => {
        setSaving(true);
        const r = await clips.create(episode.id, s.range, s.caption, episode.durationMs);
        setSaving(false);
        if (r.kind === 'sent') {
          const clip = r.clip;
          share({ ...clipShare(clip, episode, 'Clip saved — share it'), onClosed: () => router.back() });
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

