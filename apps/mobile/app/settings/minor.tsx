/**
 * Minor mode (未成年模式, M10): hides every episode its publisher marked explicit — in
 * Updates, show pages and the inbox. The mark is the publisher's own `<itunes:explicit>`;
 * an unmarked episode is shown.
 *
 * M17 (`SettingsMinor-B`): a centred page — the umbrella on a yellow disc, the serif title and
 * what the mode does under it, then one card with the switch and its state ("On" / "Off"), and
 * the note about publishers under a hairline. Same switch, same name, same pref.
 */
import { useState } from 'react';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { size } from '../../src/design';
import { getPref, setPref } from '../../src/settings/prefs';
import { useStores } from '../../src/ui/providers';
import { useColours } from '../../src/ui/useColours';
import { Icon } from '../../src/ui/Icon';
import { Toggle } from '../../src/ui/Toggle';
import { Card } from '../../src/ui/Card';
import { PageHeader } from '../../src/ui/PageHeader';

const TAP = { minHeight: size.row };
const DISC = { width: 112, height: 112 };

export default function MinorMode(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const [on, setOn] = useState(() => getPref(stores.settings, 'hideExplicit'));
  return (
    <>
    {/* M17: an empty middle — the title is drawn centred under the disc instead. */}
    <PageHeader middle={<Box />} />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-row pb-24">
      <Box className="items-center">
        <Box className="bg-primary rounded-pill items-center justify-center" style={DISC}>
          <Icon name="umbrella-outline" size={48} color={c.onPrimary} />
        </Box>
        <Text className="text-text text-display font-display text-center mt-section" accessibilityRole="header">Minor mode</Text>
        <Text className="text-muted text-body text-center mt-gap leading-[22px]">Episodes their publisher marks explicit are not listed in Updates, show pages or the inbox.</Text>
      </Box>
      <Card className="mt-section py-row">
        <Box className="flex-row items-center gap-section" style={TAP}>
          <Box className="flex-1">
            <Text className="text-text text-body font-bold">Hide explicit episodes</Text>
            <Text className="text-accent text-xs font-bold mt-0.5">{on ? 'On' : 'Off'}</Text>
          </Box>
          {/* M16a T004: the app's own toggle, not the iOS switch. */}
          <Toggle value={on} onChange={(v) => { setOn(v); setPref(stores.settings, 'hideExplicit', v); }} label="Hide explicit episodes" />
        </Box>
      </Card>
      <Box className="border-b-hairline border-separator mt-section mx-1" />
      <Text className="text-muted text-xs mt-row mx-1">This relies on each publisher marking its episodes. SocialNet does not check the audio itself.</Text>
    </ScrollView>
    </>
  );
}
