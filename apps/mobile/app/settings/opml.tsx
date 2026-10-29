// Export your shows as an OPML file, or paste OPML to import them.
/**
 * Import or export subscriptions (导入或导出订阅列表, M10). Export shares an OPML file's text
 * through the phone's share sheet; import takes OPML pasted in and subscribes to every
 * feed in it that you do not already follow, then syncs (M8).
 *
 * M17 T092 (`SettingsOpml-B`): export is a card with the subscription count as a serif figure;
 * import is three numbered steps — the apps as chips (the chosen one yellow) with its steps
 * under them, the paste box, then Subscribe. Same handlers, names and share panel as before.
 *
 * M31 S-B (T060; design-pulse2 `settings-opml--screen`, `--from-app`, `--found`, `--export-sheet`, `--share-sheet`, `toast--settings-opml`; layout Panel with
 * a Stage-size value): under the edge label EXPORT a tile holds the subscription count in Unbounded 800 56 (hot-text — React Native cannot fill
 * text with the drawn hot-to-violet gradient), the line beside it and "Export subscriptions" (light); under IMPORT three numbered steps (a light
 * dot 28, the step's title in Unbounded 16): the apps as chips and the chosen one's steps in a raise-2 tile, the paste box (radius 18, mono 12), the
 * found line in mono hot-text, and "Subscribe to n" / "Nothing new to import". The share panel and the system share sheet are the kit's.
 * Same handlers, names, toasts and share panel as before.
 */
import { useMemo, useState } from 'react';
import { Share } from 'react-native';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { useColours } from '@/ui/kit/useColours';
import { fromOpml, toOpml } from '@/settings/opml';
import { useStores, useSubscriptionSync, useToast } from '@/ui/shell/providers';
import { plural } from '@socialmorning/social-core';
import { Box } from '@/ui/lib/box';
import { EXPORT_STEPS } from '@/settings/export-steps';
import { useSharePanel } from '@/ui/clips/ShareChooser';
import { Chip } from '@/ui/kit/Chip';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { colour } from '@/design';
import { Line, Section, SettingsPage, Tile } from '@/ui/settings/panel';
import { SET, SET_TYPE } from '@/ui/settings/measures';

/** A numbered step heading: a light disc 28 with the number in mono, then the title in Unbounded 16. */
function Step(props: { n: number; title: string }): React.ReactElement {
  return (
    <Box className="flex-row items-center" style={{ gap: SET.rowGap - 2 }}>
      <Box testID="step-dot" className="bg-text items-center justify-center" style={{ width: SET.stepDot, height: SET.stepDot, borderRadius: SET.stepDot / 2 }} accessible={false} importantForAccessibility="no-hide-descendants">
        <Type step="mono" className="text-void font-semibold" style={SET_TYPE.mono13}>{String(props.n)}</Type>
      </Box>
      <Type step="lede" className="text-text flex-1" style={SET_TYPE.step} accessibilityRole="header">{props.title}</Type>
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
  // M32 T091: the subscriptions are read once, and again after an import — not on every keystroke.
  const [version, setVersion] = useState(0);
  const subscribed = useMemo(() => new Set(stores.subscriptions.list().map((s) => s.feedUrl)), [stores, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const found = useMemo(() => fromOpml(text), [text]);
  const fresh = useMemo(() => found.filter((u) => !subscribed.has(u)), [found, subscribed]);
  const count = subscribed.size;
  const chosen = EXPORT_STEPS.find((a) => a.app === openApp);

  const exportAll = () => {
    const shows = stores.subscriptions.list().map(({ feedUrl }) => ({ feedUrl, ...(stores.feeds.getShow(feedUrl)?.title ? { title: stores.feeds.getShow(feedUrl)!.title } : {}) }));
    if (shows.length === 0) { toast('You have no subscriptions to export.'); return; }
    share({ heading: 'Export subscriptions', more: { detail: 'OPML to another app', run: () => void Share.share({ title: 'SocialNet subscriptions.opml', message: toOpml(shows, new Date()) }) } });
  };
  const importAll = () => {
    const now = Date.now();
    for (const u of fresh) stores.subscriptions.add(u, now);
    setVersion((v) => v + 1);
    sync.push();
    toast(`Subscribed to ${plural(fresh.length, 'show')}.`);
    setText('');
  };

  return (
    <>
    <SettingsPage title="Import or export">
      <Section label="Export">
        <Tile>
          <Box className="flex-row items-end" style={{ gap: SET.tileGap }} accessible accessibilityLabel={`Share your ${plural(count, 'subscription')} as OPML, to keep or to open in another app.`}>
            <Type step="figure" className="text-hotText" style={SET_TYPE.stat}>{String(count)}</Type>
            <Box className="flex-1" style={{ paddingBottom: SET.tileGap }}><Line>{count === 1 ? 'subscription' : 'subscriptions'}, as OPML — to keep or to open in another app.</Line></Box>
          </Box>
          <PulseButton label="Export subscriptions" onPress={exportAll} full />
        </Tile>
      </Section>

      <Section label="Import">
        <Box style={{ gap: SET.gap }}>
          <Step n={1} title="Export OPML from your other app" />
          {/* M12 FR-095: where each app keeps its export — tap one to see the steps. */}
          <Box className="flex-row flex-wrap gap-gap">
            {EXPORT_STEPS.map((a) => {
              const shown = openApp === a.app;
              return <Chip key={a.app} label={`From ${a.app}`} chosen={shown} onPress={() => setOpenApp(shown ? undefined : a.app)} accessibilityLabel={`From ${a.app}`} />;
            })}
          </Box>
          {chosen ? (
            <Tile testID="app-steps" style={{ backgroundColor: colour.raise2 }}>
              <Box>
                {chosen.steps.map((step, i) => <Type key={step} step="note" className="text-text font-normal" style={SET_TYPE.stepLine}>{`${i + 1}. ${step}`}</Type>)}
              </Box>
              {chosen.note ? <Line>{chosen.note}</Line> : null}
            </Tile>
          ) : null}

          <Step n={2} title="Paste it here" />
          <Textarea className="border-0 h-auto bg-raise" style={{ borderRadius: SET.pasteRadius, minHeight: text.trim() !== '' ? SET.pasteMinFilled : SET.pasteMin }}>
            <TextareaInput value={text} onChangeText={setText} multiline placeholder="Paste OPML here" placeholderTextColor={c.text3} autoCorrect={false} autoCapitalize="none" accessibilityLabel="OPML to import" className="text-text font-mono text-pulse-mono" style={[SET_TYPE.paste, { padding: SET.pastePad }]} />
          </Textarea>
          {text.trim() !== '' ? <Type step="mono" className="text-hotText" style={SET_TYPE.mono13}>{plural(found.length, 'show')} found, {fresh.length} new.</Type> : null}

          <Step n={3} title="Subscribe" />
          <PulseButton label={fresh.length > 0 ? `Subscribe to ${fresh.length}` : 'Nothing new to import'} onPress={importAll} disabled={fresh.length === 0} full />
        </Box>
      </Section>
    </SettingsPage>
    {sharePanel}
    </>
  );
}
