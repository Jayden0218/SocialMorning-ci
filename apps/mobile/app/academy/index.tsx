// Creator academy: help articles for show owners, as a Mosaic.
/**
 * Creator academy (M12 FR-103): help for show owners, opened in the app.
 *
 * M21 T086 (FR-065): tabs — All, Get started, Grow, Community — each showing its articles.
 * M25 A8: each article names its tab (`tag`, set in Admin › Content); one with none shows under All only.
 *
 * M31 W5-D (T064; design-pulse2 `discover.html` `academy--screen`, layout pattern Mosaic): a pushed page, the title bar low
 * ("Creator academy" at 28, "For people who make shows"), the four filter chips (All · Get started · Grow · Community) in the 28
 * lane under the status bar, then the Mosaic: the first article is the 2 x 3 hot tile — "START HERE · 1" in mono 11, the title in
 * Unbounded 800 24, the summary in Geist 500 14/20 and a send glyph at the foot, all in void — and the rest follow as numbered tiles
 * (the number in Unbounded 800 22, hot-text, the title in Unbounded 700 14): 1 x 2 for the first two, 1 x 1 after. Each opens
 * `/academy/[slug]`. The numbers are written plain ("2"), as drawn.
 *
 * Spec 039 (Feed lane, design B): a `FeedPage`; the chips sit under the title and the articles are cards, one under another on the 20 gutter: the first is the hot
 * card (void words), the rest raise cards with their number. No mosaic, no 2 x 3 or 1 x 2 places.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, radius, spacing } from '@/design';
import { useAcademy } from '@/config/content';
import { Chip } from '@/ui/kit/Chip';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { FeedPage } from '@/ui/feed/FeedPage';
import { PAGE, PAGE_TYPE } from '@/ui/discover/measures';

type Tab = 'all' | 'start' | 'grow' | 'community';
const TABS: readonly { value: Tab; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'start', label: 'Get started' }, { value: 'grow', label: 'Grow' }, { value: 'community', label: 'Community' },
];

export default function Academy(): React.ReactElement {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('all');
  // M25 A8: the server's articles (Admin › Content), the bundled copy when it cannot be reached.
  const articles = useAcademy();
  const shown = articles.filter((a) => tab === 'all' || a.tab === tab);
  return (
    <FeedPage
      title="Creator academy"
      subtitle="For people who make shows"
      header={
        <Box className="flex-row flex-wrap" style={{ gap: PAGE.gap - 2 }}>
          {TABS.map((t) => <Chip key={t.value} label={t.label} chosen={tab === t.value} onPress={() => setTab(t.value)} />)}
        </Box>
      }
      data={shown}
      keyExtractor={(a) => a.slug}
      gap={spacing.row}
      renderItem={({ item: a, index: i }) => {
        const lead = i === 0;
        return (
          <Box testID="academy-card" className={`overflow-hidden ${lead ? 'bg-hot' : 'bg-raise'}`} style={{ borderRadius: radius.card }}>
            <Pressable onPress={() => router.push({ pathname: '/academy/[slug]', params: { slug: a.slug } })} accessibilityRole="button" accessibilityLabel={`${a.title}. ${a.summary}`} className="flex-1" style={{ padding: PAGE.pad, gap: PAGE.gap - 2 }}>
              {lead ? (
                <>
                  <Type step="tag" className="text-void font-semibold" style={PAGE_TYPE.eyebrow}>{`START HERE · ${i + 1}`}</Type>
                  <Type step="hero" className="text-void" style={PAGE_TYPE.title24}>{a.title}</Type>
                  <Type step="note" className="text-void font-medium" numberOfLines={5}>{a.summary}</Type>
                  <Box className="self-end"><Icon name="send-outline" size={26} color={colour.void} /></Box>
                </>
              ) : (
                <>
                  <Type step="hero" className="text-hotText" style={PAGE_TYPE.title22}>{String(i + 1)}</Type>
                  <Type step="lede" className="text-text" style={PAGE_TYPE.tile14} numberOfLines={4}>{a.title}</Type>
                </>
              )}
            </Pressable>
          </Box>
        );
      }}
    />
  );
}
