/**
 * Import or export subscriptions (导入或导出订阅列表, M10). Export shares an OPML file's text
 * through the phone's share sheet; import takes OPML pasted in and subscribes to every
 * feed in it that you do not already follow, then syncs (M8).
 *
 * M17 T092 (`SettingsOpml-B`): export is a card with the subscription count as a serif figure;
 * import is three numbered steps — the apps as chips (the chosen one yellow) with its steps
 * under them, the paste box, then Subscribe. Same handlers, names and share panel as before.
 */
import { useState } from 'react';
import { Share } from 'react-native';
import { Textarea, TextareaInput } from '../../src/ui/lib/textarea';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { useColours } from '../../src/ui/useColours';
import { fromOpml, toOpml } from '../../src/settings/opml';
import { Button } from '../../src/ui/Button';
import { useStores, useSubscriptionSync, useToast } from '../../src/ui/providers';
import { plural } from '@socialmorning/social-core';
import { Box } from '../../src/ui/lib/box';
import { EXPORT_STEPS } from '../../src/settings/export-steps';
import { PageHeader } from '../../src/ui/PageHeader';
import { useSharePanel } from '../../src/ui/ShareChooser';
import { Card } from '../../src/ui/Card';
import { Eyebrow } from '../../src/ui/Eyebrow';
import { Chip } from '../../src/ui/Chip';

/** A numbered step heading: a dark disc with the number, then the serif title. */
function Step(props: { n: number; title: string }): React.ReactElement {
  return (
    <Box className="flex-row items-center gap-row mt-gap">
      <Box className="w-7 h-7 rounded-pill bg-text items-center justify-center">
        <Text className="text-background text-meta font-bold">{String(props.n)}</Text>
      </Box>
      <Text className="text-text text-title font-display flex-1" accessibilityRole="header">{props.title}</Text>
    </Box>
  );
}

export default function OpmlScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const sync = useSubscriptionSync();
  const toast = useToast();
  // M16a T005 (FR-015): the app's share panel first; the system sheet behind "More".
  const [share, sharePanel] = useSharePanel();
  const [text, setText] = useState('');
  const [openApp, setOpenApp] = useState<string | undefined>();
  const found = fromOpml(text);
  const fresh = found.filter((u) => !stores.subscriptions.has(u));
  const count = stores.subscriptions.list().length;
  const chosen = EXPORT_STEPS.find((a) => a.app === openApp);

  const exportAll = () => {
    const shows = stores.subscriptions.list().map(({ feedUrl }) => ({ feedUrl, ...(stores.feeds.getShow(feedUrl)?.title ? { title: stores.feeds.getShow(feedUrl)!.title } : {}) }));
    if (shows.length === 0) { toast('You have no subscriptions to export.'); return; }
    share({ heading: 'Export subscriptions', more: { detail: 'OPML to another app', run: () => void Share.share({ title: 'SocialNet subscriptions.opml', message: toOpml(shows, new Date()) }) } });
  };
  const importAll = () => {
    const now = Date.now();
    for (const u of fresh) stores.subscriptions.add(u, now);
    sync.push();
    toast(`Subscribed to ${plural(fresh.length, 'show')}.`);
    setText('');
  };

  return (
    <>
    <PageHeader title="Import or export" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-section gap-row" keyboardShouldPersistTaps="handled">
      <Card className="py-section gap-gap">
        <Eyebrow accent>Export</Eyebrow>
        <Box accessible accessibilityLabel={`Share your ${plural(count, 'subscription')} as OPML, to keep or to open in another app.`}>
          <Text className="text-text text-display font-display">{String(count)}</Text>
          <Text className="text-muted text-body">{count === 1 ? 'subscription' : 'subscriptions'}, as OPML — to keep or to open in another app.</Text>
        </Box>
        <Button label="Export subscriptions" onPress={exportAll} className="mt-gap" />
      </Card>

      <Step n={1} title="Export OPML from your other app" />
      {/* M12 FR-095: where each app keeps its export — tap one to see the steps. */}
      <Box className="flex-row flex-wrap gap-gap">
        {EXPORT_STEPS.map((a) => {
          const shown = openApp === a.app;
          return <Chip key={a.app} label={`From ${a.app}`} chosen={shown} onPress={() => setOpenApp(shown ? undefined : a.app)} accessibilityLabel={`From ${a.app}`} />;
        })}
      </Box>
      {chosen ? (
        <Box className="gap-1">
          {chosen.steps.map((step, i) => <Text key={step} className="text-text text-body">{`${i + 1}. ${step}`}</Text>)}
          {chosen.note ? <Text className="text-muted text-xs">{chosen.note}</Text> : null}
        </Box>
      ) : null}

      <Step n={2} title="Paste it here" />
      <Textarea className="bg-surface border border-border rounded-row min-h-24 h-auto">
        <TextareaInput value={text} onChangeText={setText} multiline placeholder="Paste OPML here" placeholderTextColor={c.muted} autoCorrect={false} autoCapitalize="none" accessibilityLabel="OPML to import"  className="p-row text-text text-xs" />
      </Textarea>
      {text.trim() !== '' ? <Text className="text-muted text-body">{plural(found.length, 'show')} found, {fresh.length} new.</Text> : null}

      <Step n={3} title="Subscribe" />
      <Button label={fresh.length > 0 ? `Subscribe to ${fresh.length}` : 'Nothing new to import'} onPress={importAll} disabled={fresh.length === 0} />
    </ScrollView>
    {sharePanel}
    </>
  );
}
