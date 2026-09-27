/** Stickers (贴纸, M10): listening milestones — earned ones in colour, the rest with how far along you are. */
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { colour } from '../src/design';
import { Icon } from '../src/ui/Icon';
import { listMoments } from '../src/me/moments';
import { stickers, type Sticker } from '../src/me/stickers';
import { useSocial } from '../src/social/context';
import { useStores } from '../src/ui/providers';

export default function StickersScreen(): React.ReactElement {
  const stores = useStores();
  const { api, listener } = useSocial();
  const [list, setList] = useState<Sticker[]>(() => stickers({ listenedMs: 0, finished: 0, moments: listMoments(stores.settings).length, comments: 0 }));
  useEffect(() => {
    if (!listener) return;
    let live = true;
    void api.profile(listener.listenerId).then((p) => {
      if (!live) return;
      setList(stickers({ listenedMs: p.stats?.all.listenedMs ?? 0, finished: p.stats?.all.finished ?? 0, moments: listMoments(stores.settings).length, comments: p.recent.filter((r) => r.kind === 'commented').length }));
    }, () => undefined);
    return () => { live = false; };
  }, [api, listener, stores]);
  const earned = list.filter((s) => s.earned).length;
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-section pb-24">
      <Text className="text-text text-base font-bold mb-section" accessibilityRole="header">{earned} of {list.length} earned</Text>
      {!listener ? <Text className="text-muted text-sm mb-section">Sign in to count your listening time.</Text> : null}
      <View className="flex-row flex-wrap gap-row">
        {list.map((s) => (
          <View key={s.id} className={`w-[31%] rounded-artwork p-row items-center gap-1 ${s.earned ? 'bg-surface' : 'border border-separator'}`} accessible accessibilityLabel={`${s.title}. ${s.progress}`}>
            <View className={s.earned ? '' : 'opacity-40'}><Icon name={s.icon} size={28} color={s.earned ? colour.text : colour.muted} /></View>
            <Text className="text-text text-xs font-semibold text-center" numberOfLines={2}>{s.title}</Text>
            <Text className="text-muted text-xs text-center">{s.progress}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
