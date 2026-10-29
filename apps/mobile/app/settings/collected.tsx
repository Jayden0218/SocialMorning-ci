// List of personal data the app keeps, with counts; tap for details.
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
 *
 * M31 S-A (T060; design-pulse2 `settings-collected--screen`, `--detail-sheet`, `--signed-out`; Panel): the lede in 15 / 600 text, the counts note in 12 text-2; three groups
 * under the edge labels ACCOUNT · IN THE APP · DEVICE, each with its line (12) and a group tile of rows — the title 15 / 600, the count in mono 14 on the right (Comments, clips and
 * reactions has none), a chevron. A row opens the detail sheet (the kit `ActionSheet`, title "What SocialNet keeps" with its close circle): the item in Unbounded 26, its count big,
 * then Purpose · When it is collected · What exactly as three numbered steps (a 26 disc with the number in mono hot-text, the label in mono caps, the words in 15 / 21).
 */
import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { listFavourites } from '@/me/favourites';
import { listMoments } from '@/me/moments';
import { readHistory } from '@/search/history';
import { collectedList, type CollectedItem } from '@/settings/collected';
import { useSocial } from '@/social/context';
import { useStores } from '@/ui/shell/providers';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Icon } from '@/ui/kit/Icon';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { PanelGroup } from '@/ui/me/Panel';
import { Caps, Lede, Note, Sec, SetPage, SetRow } from '@/ui/settings/hub-parts';
import { SET, SET_TYPE } from '@/ui/settings/hub-measures';

const STEP_DISC = 26;
/** The edge label is the short form of the group's name (`COLLECTED` in the drawing); the long one is what a screen reader says. */
const EDGE = ['Account', 'In the app', 'Device'] as const;

export default function CollectedScreen(): React.ReactElement {
  const stores = useStores();
  const { listener } = useSocial();
  const [open, setOpen] = useState<CollectedItem | undefined>();
  // M32 T091: the counts are read when the page is shown, not on every render.
  const [version, setVersion] = useState(0);
  useFocusEffect(useCallback(() => { setVersion((v) => v + 1); }, []));
  const signedIn = listener !== undefined;
  const groups = useMemo(() => collectedList({
    signedIn,
    history: stores.positions.all().length,
    favourites: listFavourites(stores.settings).length,
    moments: listMoments(stores.settings).length,
    searches: readHistory(stores.settings).length,
    subscriptions: stores.subscriptions.list().length,
  }), [stores, signedIn, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <PushedPage title="Information we collect" size={26}>
      {(layout) => (
        <SetPage layout={layout}>
          <Lede strong>SocialNet keeps the information below, and nothing else.</Lede>
          <Note>Counts are from this phone and may lag the server. Tap an item for its purpose, when it is collected and what exactly.</Note>
          {groups.map((g, gi) => (
            <Sec key={g.title} label={EDGE[gi] ?? g.title} spoken={g.title}>
              <Box style={{ gap: SET.gap - 4 }}>
                <Note>{g.line}</Note>
                <PanelGroup>
                  {g.items.map((i) => (
                    <SetRow
                      key={i.id}
                      label={i.title}
                      onPress={() => setOpen(i)}
                      accessibilityLabel={`${i.title}${i.count !== undefined ? `, ${i.count} held` : ''}. ${i.purpose}. Details`}
                      right={(
                        <Box className="flex-row items-center" style={{ gap: SET.rowGap }}>
                          {i.count !== undefined ? <Type step="mono" className="text-text" style={SET_TYPE.mono14}>{String(i.count)}</Type> : null}
                          <Icon name="chevron-forward" size={SET.chevron} color={colour.text3} />
                        </Box>
                      )}
                    />
                  ))}
                </PanelGroup>
              </Box>
            </Sec>
          ))}
          <ActionSheet open={open !== undefined} onClose={() => setOpen(undefined)} label="What SocialNet keeps" title="What SocialNet keeps">
            <Type step="hero" className="text-text" style={SET_TYPE.display26} accessibilityRole="header">{open?.title}</Type>
            {open?.count !== undefined ? (
              <Box className="flex-row items-end" style={{ gap: SET.gap - 4 }}>
                <Type step="figure" className="text-hotText" style={SET_TYPE.count44}>{String(open.count)}</Type>
                <Type step="caption" className="text-text2" style={{ paddingBottom: 6 }}>held on this account</Type>
              </Box>
            ) : null}
            {([['Purpose', open?.purpose], ['When it is collected', open?.when], ['What exactly', open?.scope]] as const).map(([label, value], n) => (
              <Box key={label} className="flex-row" style={{ gap: SET.rowGap }}>
                <Box className="bg-raise items-center justify-center" style={{ width: STEP_DISC, height: STEP_DISC, borderRadius: STEP_DISC / 2 }} accessible={false}>
                  <Type step="mono" className="text-hotText font-bold" style={SET_TYPE.mono12}>{`${n + 1}`}</Type>
                </Box>
                <Box className="flex-1" style={{ gap: 4 }}>
                  <Caps>{label}</Caps>
                  <Type step="body" className="text-text" style={SET_TYPE.field15}>{value ?? ''}</Type>
                </Box>
              </Box>
            ))}
          </ActionSheet>
        </SetPage>
      )}
    </PushedPage>
  );
}
