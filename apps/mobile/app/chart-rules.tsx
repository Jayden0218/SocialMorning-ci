// How the three charts are ranked and how often they update, in plain words.
/**
 * M21 US7 (T084, FR-062, acceptance 5). The same rules as the server's
 * apps/api/src/db/repos/discover/explore.ts — if one changes, change the other.
 *
 * M31 W5-D (T064; design-pulse2 `discover.html` `chart-rules--screen`, layout pattern Panel): a pushed page, the title bar low
 * ("How the charts work", 26, two lines), and four grouped tiles in the 28 lane (radius 22, raise, a 1 line, 16 of padding, 10 apart):
 * the three charts, each with its name in Unbounded 700 17 and its rules in Geist 14/20, and "How often they update". The Talked about
 * weights are four count tiles (3 listener, 2 comment, 2 clip, 1 reaction: radius 14, the figure in Unbounded 800 20 hot-text) over
 * "Private listening is never counted.". The words are the page's own, unchanged but for the weights, which the tiles now say.
 */
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { PAGE, PAGE_TYPE } from '@/ui/discover/measures';
import { bodyTop } from '@/ui/discover/page-parts';

const RULES: { title: string; lines: string[]; weights?: boolean }[] = [
  { title: 'Talked about', lines: ['Episodes ranked by what listeners here did with them in the last 7 days.'], weights: true },
  {
    title: 'New shows',
    lines: [
      'Shows whose first episode is the newest, newest first, each with its latest episode.',
      'We can only see episodes this app has met, so an older show we found late can look new for a while.',
    ],
  },
  {
    title: 'Rising',
    lines: [
      'Episodes whose listens and comments grew the most: the last 7 days minus the 7 days before.',
      'Only episodes that grew are on it.',
    ],
  },
];
/** What a listener, a comment, a clip and a reaction count for. */
const WEIGHTS: readonly (readonly [string, string])[] = [['3', 'listener'], ['2', 'comment'], ['2', 'clip'], ['1', 'reaction']];

const TILE = { borderRadius: PAGE.radius, padding: ME_MOSAIC.panelPad, gap: PAGE.gap - 2 };

export default function ChartRulesScreen(): React.ReactElement {
  return (
    <PushedPage title="How the charts work" size={26}>
      {(layout) => (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: bodyTop(layout), paddingBottom: layout.reserve }}>
          <Box style={{ marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right, gap: PAGE.gap }}>
            {RULES.map((r) => (
              <Box key={r.title} testID="rules-tile" className="bg-raise border border-line" style={TILE}>
                <Type step="lede" className="text-text" style={PAGE_TYPE.tile17} accessibilityRole="header">{r.title}</Type>
                {r.lines.map((l) => <Type key={l} step="body" className="text-text">{l}</Type>)}
                {r.weights ? (
                  <>
                    <Box testID="weights" className="flex-row" style={{ gap: 6, marginTop: 4 }}>
                      {WEIGHTS.map(([n, label]) => (
                        <Box key={label} testID="weight" className="flex-1 bg-raise2 items-center" style={{ borderRadius: 14, padding: 8 }} accessible accessibilityLabel={`A ${label} counts ${n}`}>
                          <Type step="hero" className="text-hotText" style={PAGE_TYPE.rank20}>{n}</Type>
                          <Type step="tag" className="text-text2" style={{ marginTop: 4, textAlign: 'center' }}>{label}</Type>
                        </Box>
                      ))}
                    </Box>
                    <Type step="caption" className="text-text2" style={PAGE_TYPE.small12}>Private listening is never counted.</Type>
                  </>
                ) : null}
              </Box>
            ))}
            <Box className="bg-raise border border-line" style={{ borderRadius: PAGE.radius, padding: ME_MOSAIC.panelPad }}>
              <Type step="row" className="text-text">How often they update</Type>
              <Type step="body" className="text-text2" style={{ marginTop: 6 }}>Every chart is worked out again at most every 5 minutes. Shows you hid, and shows taken down, never appear on any chart.</Type>
            </Box>
          </Box>
        </ScrollView>
      )}
    </PushedPage>
  );
}
