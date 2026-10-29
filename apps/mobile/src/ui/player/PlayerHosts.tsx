// The player's moment sheet, comment composer, share panel, comment poll and clap burst, each its own small part.
/**
 * M31 T024 (review D7). The old page held these inline with the social context at the top, so every
 * social change redrew the whole page. Here each reads the social context itself:
 *   - `MomentHost`: a tap on an avatar pin seeks there and opens the moment's comments
 *     (`MomentSheet`); "Reply at m:ss" closes it and opens the composer (`ComposerSheet`) at that
 *     moment, then refreshes the episode when posted.
 *   - `PollHost`: runs the 10 s comment poll while this page is focused and the app is in the foreground
 *     (US2, T032/T033). It draws nothing; it is a part of its own because the poll's hook reads the
 *     social context, which changes with every poll.
 *   - `ClapHost`: the thumbs burst when a reaction is turned on (M21 US2) — over everything, never in the
 *     way of a tap.
 *   - `ShareHost`: Share opens the app's share panel (`ShareChooser`) with the position at the moment it
 *     was opened; Clip inside it goes to the clip composer; a share is recorded.
 * Their own looks (`MomentSheet`, `ShareChooser`) belong to the comments and clips waves (3 and 2).
 */
import { useMemo, useState } from 'react';
import { reportAndDrop } from '@/telemetry/reportError';
import { mmss } from '@/ui/kit/format';
import { useSocial } from '@/social/context';
import type { ComposerState } from '@/social/composer';
import { ComposerSheet } from '@/ui/comments/Composer';
import { MomentSheet } from '@/ui/comments/MomentSheet';
import { ShareChooser } from '@/ui/clips/ShareChooser';
import { usePoll } from '@/social/usePoll';
import { playerDurationMs, playerPositionMs, usePlayer } from '@/playback/store';
import type { CachedEpisode, CachedShow } from '@/storage/types';
import type { RailMarker } from './Rail';
import { ClapBurst } from './ClapBurst';
import { useClip } from './useClipAndComments';
import { useClaps } from './useReaction';

export function MomentHost(props: { episodeId: string; marker: RailMarker | undefined; onClose: () => void }): React.ReactElement {
  const player = usePlayer();
  const { composer, refresh, useEpisodeSocial } = useSocial();
  const { cached } = useEpisodeSocial(props.episodeId);
  const [composing, setComposing] = useState<ComposerState | undefined>();
  const { marker } = props;
  return (
    <>
      {composing ? (
        <ComposerSheet initial={composing} onClose={() => setComposing(undefined)} onPosted={() => { void refresh(props.episodeId); }} />
      ) : null}
      {marker ? (
        <MomentSheet
          episodeId={props.episodeId}
          title={`At ${mmss(marker.offsetMs)}`}
          comments={(cached?.social.comments ?? []).filter((c) => marker.comments.some((m) => m.id === c.id || c.replies?.some((r) => r.id === m.id)))}
          onClose={props.onClose}
          onReply={(parentId) => {
            props.onClose();
            const state = player.getState();
            const durationMs = playerDurationMs(state);
            setComposing(composer.open({ episodeId: props.episodeId, offsetMs: playerPositionMs(state), ...(durationMs !== undefined ? { durationMs } : {}) }, parentId));
          }}
        />
      ) : null}
    </>
  );
}

export function ShareHost(props: { open: boolean; onClose: () => void; episodeId: string; episode: CachedEpisode | undefined; show: CachedShow | undefined }): React.ReactElement | null {
  const player = usePlayer();
  const { api } = useSocial();
  const clip = useClip(props.episodeId);
  // The position the share starts from is the one when the panel opened.
  const atMs = useMemo(() => (props.open ? playerPositionMs(player.getState()) : 0), [props.open, player]);
  const { episode, show } = props;
  if (!episode) return null;
  return (
    <ShareChooser
      open={props.open}
      onClose={props.onClose}
      episode={{ id: episode.id, title: episode.title, showTitle: show?.title ?? '' }}
      atMs={atMs}
      onClip={clip}
      onShared={() => void api.recordShare({ targetKind: 'episode', targetId: episode.id, feedUrl: episode.feedUrl }).catch(reportAndDrop('share.record'))}
    />
  );
}

export function PollHost(props: { episodeId: string | undefined }): null {
  usePoll(props.episodeId);
  return null;
}

export function ClapHost(): React.ReactElement {
  return <ClapBurst trigger={useClaps()} />;
}
