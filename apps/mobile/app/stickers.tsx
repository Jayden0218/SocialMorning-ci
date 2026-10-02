/** Stickers (贴纸, M10): listening milestones — earned ones in colour, the rest with how far along you are. */
import { useEffect, useState } from 'react';
import { ScrollView } from '../src/ui/lib/scroll-view';
import { Text } from '../src/ui/lib/text';
import { Box } from '../src/ui/lib/box';
import { colour } from '../src/design';
import { useColours } from '../src/ui/useColours';
import { Icon } from '../src/ui/Icon';
import type { Sticker } from '../src/me/stickers';
import { myStickers } from '../src/me/my-stickers';
import { useSocial } from '../src/social/context';
import { useStores } from '../src/ui/providers';
import { PageHeader } from '../src/ui/PageHeader';

export default function StickersScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const { api, listener } = useSocial();
  // M16a bug 3: the same source as the profile card (src/me/my-stickers.ts) — this phone's totals
  // at once, then the larger of those and the server's once the profile arrives.
  const [list, setList] = useState<Sticker[]>(() => myStickers(stores, undefined));
  useEffect(() => {
    if (!listener) return;
    let live = true;
    void api.profile(listener.listenerId).then((p) => {
      if (!live) return;
      setList(myStickers(stores, p));
    }, () => undefined);
    return () => { live = false; };
  }, [api, listener, stores]);
  const earned = list.filter((s) => s.earned).length;
  return (
    <>
    <PageHeader title="Stickers" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-section pb-24">
      <Text className="text-text text-base font-bold mb-section" accessibilityRole="header">{earned} of {list.length} earned</Text>
      {!listener ? <Text className="text-muted text-sm mb-section">Sign in to count your listening time.</Text> : null}
      <Box className="flex-row flex-wrap gap-row">
        {list.map((s) => (
          <Box key={s.id} className={`w-[31%] rounded-artwork p-row items-center gap-1 ${s.earned ? 'bg-surface' : 'border border-separator'}`} accessible accessibilityLabel={`${s.title}. ${s.progress}`}>
            <Box className={s.earned ? '' : 'opacity-40'}><Icon name={s.icon} size={28} color={s.earned ? c.text : c.muted} /></Box>
            <Text className="text-text text-xs font-semibold text-center" numberOfLines={2}>{s.title}</Text>
            <Text className="text-muted text-xs text-center">{s.progress}</Text>
          </Box>
        ))}
      </Box>
    </ScrollView>
    </>
  );
}
