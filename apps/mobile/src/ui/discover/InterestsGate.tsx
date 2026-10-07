// Opens the interests page once on the first open after sign-in, when no categories are saved yet.
/**
 * M22 US5 (FR-017). Drawn by the root stack (app/_layout.tsx); draws nothing. The first time the
 * tabs show to a signed-in listener in this launch it (1) sends a pick that failed to save, or
 * reads the account's choice so a new phone does not ask again, then (2) opens
 * /onboarding/interests when `interestsDueFrom` says so. Offline, step 1 is skipped and the phone's
 * own record decides.
 */
import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useStores } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { useM22DiscoverApi } from '@/social/api-m22-discover';
import { INTERESTS_MIN, interestsDueFrom, KEY_SKIPPED, KEY_UNSENT, pickedInterests, savePicked } from '@/discover/interests';

export function InterestsGate(props: { onTabs: boolean }): null {
  const stores = useStores();
  const { listener } = useSocial();
  const api = useM22DiscoverApi();
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !props.onTabs || !listener) return;
    asked.current = true;
    void (async () => {
      try {
        const mine = pickedInterests(stores.settings);
        if (stores.settings.get(KEY_UNSENT) === '1' && mine.length >= INTERESTS_MIN) {
          await api.setInterests(mine);
          stores.settings.set(KEY_UNSENT, '0');
        } else if (mine.length < INTERESTS_MIN) {
          const r = await api.interests();
          if (r.genreIds.length >= INTERESTS_MIN) savePicked(stores.settings, r.genreIds);
          else if (r.skippedAt && !stores.settings.get(KEY_SKIPPED)) stores.settings.set(KEY_SKIPPED, String(Date.parse(r.skippedAt)));
        }
      } catch {
        // Offline: the phone's own record decides.
      }
      if (interestsDueFrom(stores.settings, Date.now())) router.push('/onboarding/interests');
    })();
  }, [props.onTabs, listener, api, stores]);
  return null;
}
