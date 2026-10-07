// First open: pick at least two categories you like, or skip (asked once more a week later).
/**
 * M22 US5 (FR-017, FR-018). Opened once from app/_layout.tsx when `interestsDueFrom` says so.
 * The tiles come from the bundled list, so the page works offline. Continue (≥ 2 picks) saves
 * them on the phone and, signed in, to the account; a failed save is kept as unsent and sent on
 * the next open. Skip remembers the time; a week later the page is shown once more.
 */
import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { hit } from '@/design';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Button } from '@/ui/kit/Button';
import { useStores } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { useM22DiscoverApi } from '@/social/api-m22-discover';
import { GenreTiles } from '@/ui/discover/RecFeedback';
import { INTERESTS_MIN, KEY_UNSENT, savePicked, saveSkip, toggleGenre } from '@/discover/interests';

const TAP = { minHeight: hit.min };

export default function InterestsScreen(): React.ReactElement {
  const stores = useStores();
  const { listener } = useSocial();
  const api = useM22DiscoverApi();
  const [picked, setPicked] = useState<number[]>([]);
  const leave = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };
  const skip = () => {
    saveSkip(stores.settings, Date.now());
    if (listener) void api.skipInterests().catch(() => undefined);
    leave();
  };
  const go = () => {
    if (picked.length < INTERESTS_MIN) return;
    savePicked(stores.settings, picked);
    if (listener) {
      stores.settings.set(KEY_UNSENT, '1');
      void api.setInterests(picked).then(() => stores.settings.set(KEY_UNSENT, '0')).catch(() => undefined);
    }
    leave();
  };
  const more = INTERESTS_MIN - picked.length;
  return (
    <>
      <PageHeader
        title="What do you like?"
        subtitle="Pick at least two — For You starts from them."
        onBack={skip}
        right={(
          <Pressable onPress={skip} accessibilityRole="button" accessibilityLabel="Skip choosing categories" className="justify-center px-row" style={TAP}>
            <Text className="text-accent text-body font-semibold">Skip</Text>
          </Pressable>
        )}
      />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-section gap-section">
        <GenreTiles picked={picked} onToggle={(id) => setPicked((p) => toggleGenre(p, id))} />
      </ScrollView>
      <Box className="bg-background px-screen-x py-row border-t-hairline border-separator gap-gap">
        <Text className="text-muted text-meta text-center" accessibilityLiveRegion="polite">
          {more > 0 ? `Pick ${more} more` : `${picked.length} picked`}
        </Text>
        <Button label="Continue" onPress={go} disabled={more > 0} accessibilityLabel="Continue with these categories" />
      </Box>
    </>
  );
}
