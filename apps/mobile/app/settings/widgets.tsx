// How to add each SocialNet widget to the home screen, with a small drawing of each one.
/**
 * M22 US17 item 11 (T078). The four widgets (M10b, M21 US12): Now playing, Playlist, Daily pick and
 * Listening this week — the same four on iPhone (targets/widget) and Android (app.json,
 * react-native-android-widget). The steps follow the phone's own way of adding a widget; the
 * pictures are our own small drawings in views and token colours, not screenshots of any phone.
 */
import { Platform } from 'react-native';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card, CardDivider } from '@/ui/kit/Card';

type Widget = { name: string; line: string; size: 'wide' | 'square'; rows: number };

const WIDGETS: Widget[] = [
  { name: 'Now playing', line: 'The episode you are listening to, with play and pause.', size: 'wide', rows: 1 },
  { name: 'Playlist', line: 'The next three episodes in your playlist.', size: 'wide', rows: 3 },
  { name: 'Daily pick', line: "The editors' pick of the day.", size: 'square', rows: 2 },
  { name: 'Listening this week', line: 'How long you have listened since Monday.', size: 'square', rows: 1 },
];

const IOS_STEPS = [
  'Touch and hold an empty part of the home screen until the apps jiggle.',
  'Tap Edit, then Add Widget (or the + in the top corner).',
  'Search for SocialNet, swipe to the widget you want, and tap Add Widget.',
  'Tap Done.',
];
const ANDROID_STEPS = [
  'Touch and hold an empty part of the home screen.',
  'Tap Widgets.',
  'Scroll to SocialNet, touch and hold a widget, and drag it where you want it.',
  'Lift your finger. Some widgets can then be resized by their edges.',
];

/** A small drawing of the widget: artwork square, title lines, and a play dot on the wide ones. */
function Drawing(props: { widget: Widget }): React.ReactElement {
  const wide = props.widget.size === 'wide';
  return (
    <Box className="bg-surface border border-border rounded-row p-row gap-gap" style={{ width: wide ? 168 : 84, height: 84 }} accessible={false} importantForAccessibility="no-hide-descendants">
      {Array.from({ length: props.widget.rows }, (_, i) => (
        <Box key={i} className="flex-row items-center gap-gap flex-1">
          <Box className="bg-primary rounded" style={{ width: wide ? 20 : 16, height: wide ? 20 : 16 }} />
          <Box className="flex-1 gap-0.5">
            <Box className="bg-text rounded h-1.5" style={{ width: '80%' }} />
            <Box className="bg-muted rounded h-1" style={{ width: '50%' }} />
          </Box>
          {wide && i === 0 ? <Box className="bg-accent rounded-pill" style={{ width: 12, height: 12 }} /> : null}
        </Box>
      ))}
    </Box>
  );
}

export default function WidgetsScreen(): React.ReactElement {
  const steps = Platform.OS === 'ios' ? IOS_STEPS : ANDROID_STEPS;
  return (
    <>
    <PageHeader title="Widgets" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-2 pb-24 gap-row">
      <Text className="text-text text-base font-display mt-1" accessibilityRole="header">How to add a widget</Text>
      <Card>
        {steps.map((step, i) => (
          <Box key={step}>
            {i > 0 ? <CardDivider /> : null}
            <Box className="flex-row gap-row py-row">
              <Text className="text-accent text-body font-bold">{`${i + 1}`}</Text>
              <Text className="text-text text-body flex-1">{step}</Text>
            </Box>
          </Box>
        ))}
      </Card>
      <Text className="text-text text-base font-display mt-section" accessibilityRole="header">The four widgets</Text>
      <Card>
        {WIDGETS.map((w, i) => (
          <Box key={w.name}>
            {i > 0 ? <CardDivider /> : null}
            <Box className="flex-row items-center gap-section py-row">
              <Drawing widget={w} />
              <Box className="flex-1">
                <Text className="text-text text-body font-bold">{w.name}</Text>
                <Text className="text-muted text-xs mt-0.5">{w.line}</Text>
              </Box>
            </Box>
          </Box>
        ))}
      </Card>
    </ScrollView>
    </>
  );
}
