// One help article for show owners, in numbered sections.
/**
 * One academy article (M12 FR-103).
 *
 * Spec 039 (Detail template): a `DetailPage` (Back + the article's title, "Creator academy · n" under it); each section is a raise card on the gutter with its heading in
 * the `heading` step. The numbered rings and the spine are gone (a numbered thread is a sideways device).
 *
 * M31 W5-D (T064; design-pulse2 `discover.html` `academy--article`, `academy--article-missing`, layout pattern Thread): a pushed page,
 * the title bar low (the article's title at 24, "Creator academy · 1"). The summary opens the body in Unbounded 600 16/23, then the
 * sections are a Thread: each heading numbered in a 36 ring on a 2 wide spine, its text in a raise card (radius 18, 14 of padding) —
 * the heading in Unbounded 700 16, the body 15/22. A section with no heading hangs on the spine with no ring. An article that
 * has moved is the empty block "This article has moved", and back returns to the academy.
 * Links in an article are the Markdown block's own (hot-text, https only, never HTML).
 */
import { useLocalSearchParams } from 'expo-router';
import { Box } from '@/ui/lib/box';
import { useAcademy } from '@/config/content';
import { MarkdownBlocks } from '@/ui/content/Markdown';
import { DetailPage } from '@/ui/detail/DetailPage';
import { radius, spacing } from '@/design';
import { Type } from '@/ui/kit/Type';
import { PageEmpty } from '@/ui/me/lists';
import { PAGE_TYPE } from '@/ui/discover/measures';

export default function ArticleScreen(): React.ReactElement {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  // M25 A8: the server's article (Admin › Content), else the bundled one; bodies drawn as text runs.
  const articles = useAcademy();
  const a = articles.find((x) => x.slug === String(slug));
  if (!a) {
    return (
      <DetailPage title="Article">
        <PageEmpty top={0} title="This article has moved" line="The academy list has the current articles." />
      </DetailPage>
    );
  }
  const n = articles.findIndex((x) => x.slug === a.slug) + 1;
  return (
    <DetailPage title={a.title}>
      <Type step="caption" className="text-text2">{`Creator academy · ${n}`}</Type>
      <Type step="lede" className="text-quote" style={PAGE_TYPE.summary16}>{a.summary}</Type>
      {a.sections.map((s, i) => (
        <Box key={`${i}-${s.heading}`} testID="article-section" className="bg-raise" style={{ borderRadius: radius.row, padding: spacing.section, gap: spacing.gap }}>
          {s.heading ? <Type step="heading" className="text-text" accessibilityRole="header">{s.heading}</Type> : null}
          <MarkdownBlocks blocks={s.blocks} />
        </Box>
      ))}
    </DetailPage>
  );
}
