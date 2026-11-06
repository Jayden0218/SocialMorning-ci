// All curated issues, newest first; each opens its list of picks.
/**
 * Curated issues (M12 FR-101): every issue so far, newest first; each opens its numbered picks.
 *
 * M21 T086 (FR-064): each card carries the issue number ("No. 4"), and a row of date bubbles
 * (day over month) under the lead card opens any past issue in one tap.
 *
 * M31 W5-D (T064; design-pulse2 `discover.html` `issues--screen`, `issues--error`, layout pattern Mosaic): a pushed page, the title bar low
 * ("Issues", "Every issue so far, newest first."). The newest issue is the 2 x 3 light tile — "NO. 12 · LATEST · TUESDAY, 27 OCTOBER" in mono
 * 11, the title in Unbounded 800 26, a "Read this issue" pill (40, void). The earlier issues follow as tiles, 1 x 2 for the first two and 1 x 1
 * after, with the number and date in mono 11 over the title (Unbounded 700 14). Every tile opens `/issue/[id]`. The date bubbles of M21
 * are now the tiles (each still named "Issue of <day>" for a screen reader). A failed load is the error tile with Retry; empty says "No issues yet".
 *
 * Spec 039 (Feed lane, design B): a `FeedPage`; the issues are cards, one under another: the latest the light card with "Read this issue", the earlier ones raise cards
 * with the number and date over the title. A failed load is an `InlineNotice` with Retry; empty says "No issues yet".
 *
 * Not as drawn: no cover on a 1 x 2 tile — the issue list carries no picture (the drawing's sample covers are the shows in the issue).
 */
import { useLoad } from '@/ui/kit/useLoad';
import { useRouter } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { radius, spacing } from '@/design';
import { Loader } from '@/ui/kit/Loader';
import { InlineNotice } from '@/ui/kit/layout';
import { FeedEmpty, FeedPage } from '@/ui/feed/FeedPage';
import { EndOfList } from '@/ui/kit/EndOfList';
import { Type } from '@/ui/kit/Type';
import { dayTitle } from '@/discover/sections';
import { useM12Api, type IssueSummary } from '@/social/m12-api';
import { PAGE, PAGE_TYPE } from '@/ui/discover/measures';

export default function IssuesScreen(): React.ReactElement {
  const router = useRouter();
  const m12 = useM12Api();
  // M23 US9: cancelled on unmount; only the newest answer lands.
  const [state, load] = useLoad(() => m12.issues().then((issues) => ({ issues })), [m12], 'issues.load');
  const issues = state.kind === 'ok' ? state.issues : [];
  const num = (i: IssueSummary): number | undefined => (i as IssueSummary & { number?: number }).number;
  const eyebrow = (i: IssueSummary, latest: boolean): string => `${num(i) ? `NO. ${num(i)} · ` : ''}${latest ? 'LATEST · ' : ''}${dayTitle(i.date).toUpperCase()}`;
  return (
    <FeedPage<IssueSummary>
      title="Issues"
      subtitle="Every issue so far, newest first."
      data={issues}
      keyExtractor={(i) => i.id}
      gap={spacing.row}
      contentStyle={{ flexGrow: 1 }}
      ListHeaderComponent={state.kind === 'error' ? <InlineNotice text="Couldn't load the issues right now." actionLabel="Retry" onAction={load} /> : null}
      ListEmptyComponent={state.kind === 'loading' ? <Loader className="my-section" /> : state.kind === 'ok' ? <FeedEmpty title="No issues yet" /> : undefined}
      // Owner, 2026-10-05: the bottom of a fetched list says so.
      ListFooterComponent={issues.length > 0 ? <EndOfList /> : undefined}
      renderItem={({ item, index: i }) => {
        const it = item;
        return (
        <Box testID="issue-card" className={`overflow-hidden ${i === 0 ? 'bg-text' : 'bg-raise'}`} style={{ borderRadius: radius.card }}>
          {i === 0 ? (
            <Pressable onPress={() => router.push({ pathname: '/issue/[id]', params: { id: item.id } })} accessibilityRole="button" accessibilityLabel={`${item.title}, ${dayTitle(item.date)}`} className="flex-1" style={{ padding: PAGE.pad, gap: PAGE.gap }}>
              <Type step="tag" className="text-void font-semibold" style={PAGE_TYPE.eyebrow} numberOfLines={2}>{eyebrow(item, true)}</Type>
              <Type step="hero" className="text-void" style={PAGE_TYPE.title26} numberOfLines={4}>{item.title}</Type>
              <Box className="self-start bg-void items-center justify-center" style={{ height: 40, paddingHorizontal: PAGE.pad + 6, borderRadius: radius.pill }} accessible={false} importantForAccessibility="no-hide-descendants">
                <Type step="row" className="text-text">Read this issue</Type>
              </Box>
            </Pressable>
          ) : (
            <Pressable onPress={() => router.push({ pathname: '/issue/[id]', params: { id: item.id } })} accessibilityRole="button" accessibilityLabel={`Issue of ${dayTitle(it.date)}`} accessibilityHint={item.title} className="flex-1" style={{ padding: PAGE.pad, gap: spacing.hair + 2 }}>
              <Type step="tag" className="text-text3" style={PAGE_TYPE.mono11} numberOfLines={2}>{eyebrow(item, false).replace(/ \d{4}$/, '')}</Type>
              <Type step="lede" className="text-text" style={PAGE_TYPE.tile14} numberOfLines={3}>{item.title}</Type>
            </Pressable>
          )}
        </Box>
        );
      }}
    />
  );
}
