// First open: pick at least two categories you like, or skip (asked once more a week later).
/**
 * M22 US5 (FR-017, FR-018). Opened once from app/_layout.tsx when `interestsDueFrom` says so.
 * The tiles come from the bundled list, so the page works offline. Continue (≥ 2 picks) saves
 * them on the phone and, signed in, to the account; a failed save is kept as unsent and sent on
 * the next open. Skip remembers the time; a week later the page is shown once more.
 *
 * M31 S-C (T061; design-pulse2 `settings.html` `interestsPage`, entries `onboarding-interests--screen`, `--picked`, layout Mosaic): the
 * 19 categories as two columns of 56 tiles; the title "What do you like?" low with its back (= Skip, as before), the subtitle
 * under it and a Skip chip above it on the right; the foot row holds the counter ("Pick 2 more" in text-2, then "n picked" in
 * hot-text, read out politely) and Continue (light, 52), disabled until two are chosen.
 */
import { reportAndDrop } from '@/telemetry/reportError';
import { useState } from 'react';
import { router } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { gutter } from '@/design';
import { Chip } from '@/ui/kit/Chip';
import { OverlayPage } from '@/ui/kit/OverlayPage';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { useStores } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { useM22DiscoverApi } from '@/social/api-m22-discover';
import { GenreTiles } from '@/ui/discover/RecFeedback';
import { AUTH, AUTH_TYPE } from '@/ui/auth/measures';
import { INTERESTS_MIN, KEY_UNSENT, savePicked, saveSkip, toggleGenre } from '@/discover/interests';

export default function InterestsScreen(): React.ReactElement {
  const stores = useStores();
  const { listener } = useSocial();
  const api = useM22DiscoverApi();
  const { width } = useWindowDimensions();
  const [picked, setPicked] = useState<number[]>([]);
  const leave = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };
  const skip = () => {
    saveSkip(stores.settings, Date.now());
    if (listener) void api.skipInterests().catch(reportAndDrop('interests.skip'));
    leave();
  };
  const go = () => {
    if (picked.length < INTERESTS_MIN) return;
    savePicked(stores.settings, picked);
    if (listener) {
      stores.settings.set(KEY_UNSENT, '1');
      void api.setInterests(picked).then(() => stores.settings.set(KEY_UNSENT, '0')).catch(reportAndDrop('interests.set'));
    }
    leave();
  };
  const more = INTERESTS_MIN - picked.length;
  return (
    <OverlayPage
      title="What do you like?"
      subtitle="Pick at least two — For You starts from them."
      size={28}
      onBack={skip}
      extra={<Box className="flex-row justify-end"><Chip label="Skip" accessibilityLabel="Skip choosing categories" onPress={skip} /></Box>}
      foot={(
        <>
          <Type step="mono" className={more > 0 ? 'text-text2 flex-1' : 'text-hotText flex-1'} style={AUTH_TYPE.counter} accessibilityLiveRegion="polite">
            {more > 0 ? `Pick ${more} more` : `${picked.length} picked`}
          </Type>
          <PulseButton label="Continue" accessibilityLabel="Continue with these categories" kind="light" height={AUTH.foot.button} padX={AUTH.foot.continuePad} disabled={more > 0} onPress={go} />
        </>
      )}
    >
      {(l) => (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: l.top + AUTH.bodyTop, paddingBottom: l.reserve, paddingHorizontal: gutter(width) }}>
          <GenreTiles picked={picked} onToggle={(id) => setPicked((p) => toggleGenre(p, id))} />
        </ScrollView>
      )}
    </OverlayPage>
  );
}
