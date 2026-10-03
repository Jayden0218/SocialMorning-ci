/**
 * Stickers (贴纸, M10): listening milestones — earned ones in colour, the rest with how far along you are.
 *
 * M17 (`Stickers-B`, constitution v3.0.0): the page's name moves into the bar, small and
 * centred; the count leads as a progress ring with the earned number in the serif and
 * "N of M earned" beside it; earned stickers are a two-column grid of white cards (yellow disc,
 * icon, title); the rest are "Next up" rows with their progress line and a bar. The bar's length
 * is read from the sticker's own progress words ("17 of 42 h"), so nothing new is computed.
 */
import { useEffect, useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { useColours } from '@/ui/useColours';
import { Icon } from '@/ui/Icon';
import { ProgressRing } from '@/ui/ProgressRing';
import type { Sticker } from '@/me/stickers';
import { myStickers } from '@/me/my-stickers';
import { useSocial } from '@/social/context';
import { useStores } from '@/ui/providers';
import { PageHeader } from '@/ui/PageHeader';

/** An earned card is 72 pt tall in `Stickers-B`, and grows with the text size. */
const CARD = { minHeight: 72 };

/** "17 of 42 h" → 17 / 42; anything else → 0. */
function fraction(progress: string): number {
  const m = /^(\d+) of (\d+)/.exec(progress);
  if (!m) return 0;
  const have = Number(m[1]);
  const need = Number(m[2]);
  return need > 0 ? Math.min(1, have / need) : 0;
}

/** Pairs for the two-column grid. */
function pairs<T>(list: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += 2) out.push(list.slice(i, i + 2));
  return out;
}

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
  const got = list.filter((s) => s.earned);
  const rest = list.filter((s) => !s.earned);
  const earned = got.length;
  return (
    <>
    <PageHeader middle={<Text className="flex-1 text-center text-muted text-body font-bold" numberOfLines={1}>Stickers</Text>} />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-gap pb-24 gap-section">
      <Box className="flex-row items-center gap-section">
        <ProgressRing progress={list.length > 0 ? earned / list.length : 0} size={96} stroke={8}>
          <Text className="text-text text-hero font-display">{earned}</Text>
        </ProgressRing>
        <Text className="flex-1 text-text text-hero font-display" accessibilityRole="header">{earned} of {list.length} earned</Text>
      </Box>
      {!listener ? <Text className="text-muted text-sm">Sign in to count your listening time.</Text> : null}
      {got.length > 0 ? (
        <Box className="gap-gap">
          <Text className="text-text text-base font-display mb-1" accessibilityRole="header">Earned</Text>
          {pairs(got).map((row) => (
            <Box key={row.map((s) => s.id).join('+')} className="flex-row gap-gap">
              {row.map((s) => (
                <Box key={s.id} className="flex-1 flex-row items-center gap-row bg-surface border border-border rounded-row p-row" style={CARD} accessible accessibilityLabel={`${s.title}. ${s.progress}`}>
                  <Box className="w-10 h-10 rounded-pill bg-primary items-center justify-center"><Icon name={s.icon} size={20} color={c.onPrimary} /></Box>
                  <Text className="flex-1 text-text text-meta font-semibold" numberOfLines={3}>{s.title}</Text>
                </Box>
              ))}
              {row.length === 1 ? <Box className="flex-1" /> : null}
            </Box>
          ))}
        </Box>
      ) : null}
      {rest.length > 0 ? (
        <Box>
          <Text className="text-text text-base font-display mb-1" accessibilityRole="header">Next up</Text>
          {rest.map((s) => (
            <Box key={s.id} className="flex-row items-center gap-row py-row border-b-hairline border-separator" accessible accessibilityLabel={`${s.title}. ${s.progress}`}>
              <Icon name={s.icon} size={20} color={c.muted} />
              <Box className="flex-1 gap-1.5">
                <Box className="flex-row items-center gap-gap">
                  <Text className="flex-1 text-text text-meta font-semibold" numberOfLines={2}>{s.title}</Text>
                  <Text className="text-muted text-xs">{s.progress}</Text>
                </Box>
                <Box className="h-1 rounded-pill bg-track overflow-hidden">
                  <Box className="h-1 rounded-pill bg-accent" style={{ width: `${Math.round(fraction(s.progress) * 100)}%` as `${number}%` }} />
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      ) : null}
    </ScrollView>
    </>
  );
}
