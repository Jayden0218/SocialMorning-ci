/**
 * M12 FR-042: "N listening now" in the player. While an episode plays, the phone checks in once
 * a minute with its install id (the server keeps only a salted daily hash — no account); the
 * player reads the count once a minute. The chip shows only at 2 or more, and only when the last
 * read worked — offline it hides rather than claiming 0.
 */
import { useEffect, useState } from 'react';
import { deviceId } from '../sync/device-id';
import { useM12Api } from './m12-api';

export const LIVE_EVERY_MS = 60_000;

/** What the chip says, or nothing. */
export function liveLabel(count: number | undefined): string | undefined {
  return count !== undefined && count >= 2 ? `${count} listening now` : undefined;
}

export function useListeningNow(episodeId: string | undefined, playing: boolean): number | undefined {
  const m12 = useM12Api();
  const [count, setCount] = useState<number | undefined>();
  useEffect(() => {
    if (!episodeId) return;
    let live = true;
    const tick = async () => {
      try {
        if (playing) await m12.live(episodeId, await deviceId());
        const n = await m12.listeningNow(episodeId);
        if (live) setCount(n);
      } catch {
        if (live) setCount(undefined);
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), LIVE_EVERY_MS);
    return () => { live = false; clearInterval(timer); };
  }, [episodeId, playing, m12]);
  return count;
}
