// One help article for show owners, in numbered sections.
/**
 * One academy article (M12 FR-103).
 *
 * M31 W5-D (T064; design-pulse2 `discover.html` `academy--article`, `academy--article-missing`, layout pattern Thread): a pushed page,
 * the title bar low (the article's title at 24, "Creator academy · 1"). The summary opens the body in Unbounded 600 16/23, then the
 * sections are a Thread: each heading numbered in a 36 ring on a 2 wide spine, its text in a raise card (radius 18, 14 of padding) —
 * the heading in Unbounded 700 16, the body 15/22. A section with no heading hangs on the spine with no ring. An article that
 * has moved is the empty block "This article has moved", and back returns to the academy.
 * Links in an article are the Markdown block's own (hot-text, https only, never HTML).
 */
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { useAcademy } from '@/config/content';
import { MarkdownBlocks } from '@/ui/content/Markdown';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { DRAWN, emptyTop, PageEmpty } from '@/ui/me/lists';
import { PAGE, PAGE_TYPE } from '@/ui/discover/measures';
import { bodyTop, NumberedThread, ThreadRing } from '@/ui/discover/page-parts';

export default function ArticleScreen(): React.ReactElement {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  // M25 A8: the server's article (Admin › Content), else the bundled one; bodies drawn as text runs.
  const articles = useAcademy();
  const a = articles.find((x) => x.slug === String(slug));
  if (!a) {
    return (
      <PushedPage title="Article">
        {() => <PageEmpty top={emptyTop(260) - (PAGE.body - DRAWN.listTop)} title="This article has moved" line="The academy list has the current articles." />}
      </PushedPage>
    );
  }
  const n = articles.findIndex((x) => x.slug === a.slug) + 1;
  let ring = 0;
  return (
    <PushedPage title={a.title} subtitle={`Creator academy · ${n}`} size={24}>
      {(layout) => (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: bodyTop(layout, PAGE.body64), paddingBottom: layout.reserve }}>
          <Type step="lede" className="text-quote" style={[PAGE_TYPE.summary16, { marginLeft: ME_MOSAIC.lane, marginRight: PAGE.threadRight + 4, marginBottom: PAGE.pad }]}>{a.summary}</Type>
          <NumberedThread spineTop={6} right={PAGE.threadRight + 4}>
            {a.sections.map((s, i) => {
              if (s.heading) ring += 1;
              return (
                <Box key={`${i}-${s.heading}`} testID="article-section" className="flex-row" style={{ gap: PAGE.ringGap, marginBottom: PAGE.card.article.radius }}>
                  {s.heading ? <ThreadRing n={ring} /> : <Box style={{ width: PAGE.ring }} />}
                  <Box className="flex-1 min-w-0 bg-raise" style={{ borderRadius: PAGE.card.article.radius, padding: PAGE.card.article.pad, gap: 6 }}>
                    {s.heading ? <Type step="lede" className="text-text" style={PAGE_TYPE.summary16} accessibilityRole="header">{s.heading}</Type> : null}
                    <MarkdownBlocks blocks={s.blocks} />
                  </Box>
                </Box>
              );
            })}
          </NumberedThread>
        </ScrollView>
      )}
    </PushedPage>
  );
}
