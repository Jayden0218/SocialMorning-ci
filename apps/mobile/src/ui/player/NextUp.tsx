// Loads the "Next up" episodes, each with a reason, for the episode page.
/** "Next up" on the episode page (M5 FR-008): 3–8 episodes with a reason each; hidden when there is nothing to show. */
import { useEffect, useState } from 'react';
import { Type } from '@/ui/kit/Type';
import { Box } from '@/ui/lib/box';
import { enoughNextUp } from '@socialmorning/social-core';
import { EmptyState } from '@/ui/kit/EmptyState';
import { useSocial } from '@/social/context';
import { ApiError, type EpisodeCard, type NextUpItem } from '@/social/api';
import { EpisodeRow } from '@/ui/episode/EpisodeRow';

export function useNextUp(episodeId: string | undefined): { items: NextUpItem[] | undefined; status: 'loading' | 'ok' | 'none' } {
  const { api } = useSocial();
  // The answer for one episode; an answer for another episode is not shown (the block is loading again).
  const [answer, setAnswer] = useState<{ for: string; items: NextUpItem[] | undefined; status: 'ok' | 'none' } | undefined>();
  useEffect(() => {
    if (!episodeId) return;
    let live = true;
    api.nextUp(episodeId).then((r) => { if (live) setAnswer({ for: episodeId, items: r.items, status: 'ok' }); }).catch((e: unknown) => {
      if (!live) return;
      setAnswer({ for: episodeId, items: undefined, status: 'none' });
      if (!(e instanceof ApiError)) return; // 404 (unregistered) or offline: the block is simply absent
    });
    return () => { live = false; };
  }, [api, episodeId]);
  if (!episodeId) return { items: undefined, status: 'none' };
  if (answer?.for !== episodeId) return { items: undefined, status: 'loading' };
  return { items: answer.items, status: answer.status };
}

export function NextUp(props: { items: NextUpItem[] | undefined; onOpen: (card: EpisodeCard) => void; loadingMs?: number }): React.ReactElement | null {
  // M6 (FR-019): too few to be useful is still a surface — it says what fills it.
  if (!props.items || !enoughNextUp(props.items)) {
    return (
      <Box className="mt-block">
        <Type step="section" className="text-text mb-hair" accessibilityRole="header">Next up</Type>
        <EmptyState surface="nextup" {...(props.loadingMs !== undefined ? { loadingMs: props.loadingMs } : {})} />
      </Box>
    );
  }
  return (
    <Box className="mt-block">
      <Type step="section" className="text-text mb-hair" accessibilityRole="header">Next up</Type>
      {props.items.map((i) => <EpisodeRow key={i.episode.id} card={i.episode} line={i.label} onPress={() => props.onOpen(i.episode)} />)}
    </Box>
  );
}
