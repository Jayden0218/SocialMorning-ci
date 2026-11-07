// How to add each SocialNet widget to the home screen, with a small drawing of each one.
/**
 * M22 US17 item 11 (T078). The four widgets (M10b, M21 US12): Now playing, Playlist, Daily pick and
 * Listening this week — the same four on iPhone (targets/widget) and Android (app.json,
 * react-native-android-widget). The steps follow the phone's own way of adding a widget; the
 * pictures are our own small drawings in views and token colours, not screenshots of any phone.
 *
 * M31 S-B (T060; design-pulse2 `settings-widgets--screen`; layout Panel): under the edge label HOW TO a tile holds "How to add a widget" (Unbounded 16) and the
 * phone's numbered steps (the number in mono hot-text, the step in Geist 14 / 20); under THE FOUR one tile lists the widgets, each a small drawing (wide 120 x 60 or
 * square 60, radius 14, raise-2, hot squares for art) beside its name (Geist 600 14) and line (12). No buttons: a widget is added from the home screen.
 */
import { Platform } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Type } from '@/ui/kit/Type';
import { colour } from '@/design';
import { Section, SettingsPage, Tile } from '@/ui/settings/panel';
import { SET, SET_TYPE } from '@/ui/settings/measures';

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

/** A small drawing of the widget: hot squares for art, a bar for each title line (the drawing's `draw`). */
function Drawing(props: { widget: Widget }): React.ReactElement {
  const wide = props.widget.size === 'wide';
  return (
    <Box testID="widget-drawing" className="bg-raise2 justify-center" style={{ width: wide ? SET.widgetWide : SET.widgetSquare, height: SET.widgetHeight, borderRadius: SET.widgetRadius, padding: SET.widgetPad, gap: SET.widgetBar }} accessible={false} importantForAccessibility="no-hide-descendants">
      {Array.from({ length: props.widget.rows }, (_, i) => (
        <Box key={i} className="flex-row items-center" style={{ gap: SET.widgetBar + 1 }}>
          <Box style={{ width: SET.widgetSquareMark, height: SET.widgetSquareMark, borderRadius: 3, backgroundColor: colour.hot }} />
          <Box className="flex-1" style={{ height: SET.widgetBar, borderRadius: 2, backgroundColor: colour.glowGrey }} />
        </Box>
      ))}
    </Box>
  );
}

export default function WidgetsScreen(): React.ReactElement {
  const steps = Platform.OS === 'ios' ? IOS_STEPS : ANDROID_STEPS;
  return (
    <SettingsPage title="Widgets">
      <Section label="How to">
        <Tile style={{ gap: SET.rowGap }}>
          <Type step="lede" className="text-text" style={SET_TYPE.step} accessibilityRole="header">How to add a widget</Type>
          {steps.map((step, i) => (
            <Box key={step} className="flex-row" style={{ gap: SET.rowGap }}>
              <Type step="mono" className="text-hotText" style={[SET_TYPE.mono13, { width: SET.stepNumberWidth }]}>{`${i + 1}`}</Type>
              <Type step="note" className="text-text font-normal flex-1">{step}</Type>
            </Box>
          ))}
        </Tile>
      </Section>
      <Section label="The four">
        <Tile style={{ gap: SET.widgetListGap }}>
          {WIDGETS.map((w) => (
            <Box key={w.name} className="flex-row items-center" style={{ gap: SET.rowGap }}>
              <Drawing widget={w} />
              <Box className="flex-1">
                <Type step="compact" className="text-text">{w.name}</Type>
                <Type step="caption" className="text-text2 font-normal" style={SET_TYPE.line12}>{w.line}</Type>
              </Box>
            </Box>
          ))}
        </Tile>
      </Section>
    </SettingsPage>
  );
}
