// How the three charts are ranked and how often they update, in plain words.
/**
 * M21 US7 (T084, FR-062, acceptance 5). The same rules as the server's
 * apps/api/src/db/repos/discover/explore.ts — if one changes, change the other.
 *
 * Spec 039 (Detail template): a `DetailPage`; the tiles are on the page's gutter, 24 apart (the 28 lane is gone).
 *
 * M31 W5-D (T064; design-pulse2 `discover.html` `chart-rules--screen`, layout pattern Panel): a pushed page, the title bar low
 * ("How the charts work", 26, two lines), and four grouped tiles in the 28 lane (radius 22, raise, a 1 line, 16 of padding, 10 apart):
 * the three charts, each with its name in Unbounded 700 17 and its rules in Geist 14/20, and "How often they update". The Talked about
 * weights are four count tiles (3 listener, 2 comment, 2 clip, 1 reaction: radius 14, the figure in Unbounded 800 20 hot-text) over
 * "Private listening is never counted.". The words are the page's own, unchanged but for the weights, which the tiles now say.
 */
import { Box } from '@/ui/lib/box';
import { DetailPage } from '@/ui/detail/DetailPage';
import { radius, spacing } from '@/design';
import { Type } from '@/ui/kit/Type';
import { PAGE_TYPE } from '@/ui/discover/measures';

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

const TILE = { borderRadius: radius.row, padding: spacing.section, gap: spacing.gap };

export default function ChartRulesScreen(): React.ReactElement {
  return (
    <DetailPage title="How the charts work">
      {RULES.map((r) => (
        <Box key={r.title} testID="rules-tile" className="bg-raise" style={TILE}>
          <Type step="heading" className="text-text" accessibilityRole="header">{r.title}</Type>
          {r.lines.map((l) => <Type key={l} step="body" className="text-text">{l}</Type>)}
          {r.weights ? (
            <>
              <Box testID="weights" className="flex-row" style={{ gap: spacing.gap, marginTop: spacing.hair }}>
                {WEIGHTS.map(([n, label]) => (
                  <Box key={label} testID="weight" className="flex-1 bg-raise2 items-center" style={{ borderRadius: radius.small, padding: spacing.gap }} accessible accessibilityLabel={`A ${label} counts ${n}`}>
                    <Type step="hero" className="text-hotText" style={PAGE_TYPE.rank20}>{n}</Type>
                    <Type step="tag" className="text-text2" style={{ marginTop: spacing.hair, textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Type>
                  </Box>
                ))}
              </Box>
              <Type step="caption" className="text-text2">Private listening is never counted.</Type>
            </>
          ) : null}
        </Box>
      ))}
      <Box className="bg-raise" style={TILE}>
        <Type step="row" className="text-text">How often they update</Type>
        <Type step="body" className="text-text2">Every chart is worked out again at most every 5 minutes. Shows you hid, and shows taken down, never appear on any chart.</Type>
      </Box>
    </DetailPage>
  );
}
