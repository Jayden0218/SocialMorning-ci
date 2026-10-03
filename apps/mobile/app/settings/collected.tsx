/**
 * Personal information we collect (个人信息收集清单, M10), after the reference: groups of
 * cards, each with how many items are held; tapping a card opens its details — purpose,
 * when it is collected, and what exactly. Counts are live, from this phone.
 *
 * M17 T085 + T105 (`SettingsCollected-B`, `CollectedDetail-B`): the closing sentence moved up as a
 * serif lead under the title; each group is a serif heading over one white card of rows, each
 * row its name, the count as a serif accent figure and a chevron. The details sheet: an eyebrow
 * and Close, the item as a serif title, the count as a big serif figure, then the three facts as
 * numbered rows. Same items, same counts, same sheet behaviour.
 */
import { useState } from 'react';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '../../src/ui/lib/actionsheet';
import { Pressable } from '../../src/ui/lib/pressable';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { hit, size } from '../../src/design';
import { useColours } from '../../src/ui/useColours';
import { listFavourites } from '../../src/me/favourites';
import { listMoments } from '../../src/me/moments';
import { readHistory } from '../../src/search/history';
import { collectedList, type CollectedItem } from '../../src/settings/collected';
import { useSocial } from '../../src/social/context';
import { Icon } from '../../src/ui/Icon';
import { useStores } from '../../src/ui/providers';
import { PageHeader } from '../../src/ui/PageHeader';
import { Card, CardDivider } from '../../src/ui/Card';
import { Eyebrow } from '../../src/ui/Eyebrow';

const TAP = { minHeight: hit.min, minWidth: hit.min };
const ROW = { minHeight: size.row };

export default function CollectedScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const { listener } = useSocial();
  const [open, setOpen] = useState<CollectedItem | undefined>();
  const groups = collectedList({
    signedIn: listener !== undefined,
    history: stores.positions.all().length,
    favourites: listFavourites(stores.settings).length,
    moments: listMoments(stores.settings).length,
    searches: readHistory(stores.settings).length,
    subscriptions: stores.subscriptions.list().length,
  });
  return (
    <>
    <PageHeader title="Information we collect" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-24">
      <Text className="text-text text-base font-display">SocialNet keeps the information below, and nothing else.</Text>
      <Text className="text-muted text-xs mt-row mb-section">Counts are from this phone and may lag the server. Tap an item for its purpose, when it is collected and what exactly.</Text>
      {groups.map((g) => (
        <Box key={g.title} className="mb-section">
          <Text className="text-text text-base font-display-semibold" accessibilityRole="header">{g.title}</Text>
          <Text className="text-muted text-xs mt-0.5 mb-row">{g.line}</Text>
          <Card>
            {g.items.map((i, n) => (
              <Box key={i.id}>
                {n > 0 ? <CardDivider /> : null}
                <Pressable onPress={() => setOpen(i)} accessibilityRole="button" accessibilityLabel={`${i.title}${i.count !== undefined ? `, ${i.count} held` : ''}. ${i.purpose}. Details`} className="flex-row items-center gap-row" style={ROW}>
                  <Text className="text-text text-body font-semibold flex-1">{i.title}</Text>
                  {i.count !== undefined ? <Text className="text-accent text-title font-display-semibold">{i.count}</Text> : null}
                  <Icon name="chevron-forward" size={16} color={c.muted} />
                </Pressable>
              </Box>
            ))}
          </Card>
        </Box>
      ))}
      <Actionsheet isOpen={open !== undefined} onClose={() => setOpen(undefined)}>
        <ActionsheetBackdrop />
        <ActionsheetContent className="bg-surface rounded-t-row px-screen-x items-stretch">
          <ActionsheetDragIndicatorWrapper>
            <ActionsheetDragIndicator />
          </ActionsheetDragIndicatorWrapper>
          <Box className="flex-row items-center justify-between">
            <Eyebrow>What SocialNet keeps</Eyebrow>
            <Pressable onPress={() => setOpen(undefined)} accessibilityRole="button" accessibilityLabel="Close" className="items-center justify-center" style={TAP}>
              <Icon name="close" size={22} color={c.muted} />
            </Pressable>
          </Box>
          <Text className="text-text text-hero font-display" accessibilityRole="header">{open?.title}</Text>
          {open?.count !== undefined ? (
            <Box className="flex-row items-baseline gap-gap mt-1">
              <Text className="text-text text-display font-display">{open.count}</Text>
              <Text className="text-muted text-body">held on this account</Text>
            </Box>
          ) : null}
          {([['Purpose', open?.purpose], ['When it is collected', open?.when], ['What exactly', open?.scope]] as const).map(([label, value], n) => (
            <Box key={label}>
              <Box className={`border-b-hairline border-separator ${n === 0 ? 'mt-section' : ''}`} />
              <Box className="flex-row gap-row py-row">
                <Text className="text-accent text-base font-display w-5">{n + 1}</Text>
                <Box className="flex-1">
                  <Text className="text-text text-meta font-bold">{label}</Text>
                  <Text className="text-muted text-body mt-1">{value}</Text>
                </Box>
              </Box>
            </Box>
          ))}
        </ActionsheetContent>
      </Actionsheet>
    </ScrollView>
    </>
  );
}
