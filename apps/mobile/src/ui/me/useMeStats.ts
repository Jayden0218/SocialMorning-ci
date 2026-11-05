// The counts the Me page shows: following and followers, and how many downloads are on the phone.
/** Spec 039 US2. Both fail soft (rule IV): no network or no store means no number, never a crash. */
import { useEffect, useState } from 'react';
import { useSocial } from '@/social/context';
import { useStores } from '@/ui/shell/providers';

export function useFollowCounts(): { following: number; followers: number } | undefined {
  const { api, listener } = useSocial();
  const id = listener?.listenerId;
  const [counts, setCounts] = useState<{ following: number; followers: number } | undefined>();
  useEffect(() => {
    if (id === undefined || typeof api.profile !== 'function') return;
    let live = true;
    api.profile(id).then((p) => { if (live) setCounts({ following: p.following, followers: p.followers }); }, () => undefined);
    return () => { live = false; };
  }, [api, id]);
  return counts;
}

export function useDownloadCount(): number {
  const stores = useStores();
  try { return stores.downloads?.list().length ?? 0; } catch { return 0; }
}
