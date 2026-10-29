// Show cards, Premium picks and the video deck on Discover.
/**
 * M31 T030 (design-pulse2 `home--fold-b`, "Shows", "Premium", "Video"):
 *  - Shows (picked for you; popular): cards 150 x 180 — a cover band 120 tall, the show's name (Geist 700
 *    14) and one caption under it (the reason, or the author);
 *  - Premium: cards 260 x 96 with a violet PREMIUM tag over the violet-brown fill (no price, nothing is
 *    sold — constitution 2.1.0): the cover (72), the tag, the name, the author; a card opens the show;
 *  - Video: cards 260 x 150 — the cover fills the card, a video mark at the top left, the title and the show
 *    at the foot on a dark gradient; a card opens the episode.
 *
 * Not as drawn (gate log): the Premium card's fill and tag are the palette's violet-brown (`premiumTint`)
 * and violet at 25 %, not the drawing's one-off #16121F / #2E2346 (no new colour for one card).
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { LinearGradient } from '@/design/tailwind';
import { colour, spacing } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import type { DiscoverItem, ShowCard } from '@/social/api';
import { CoverBand, DECK, Deck, DeckCard, DeckSection, PX, useEdge } from './Deck';
import type { Act } from './sections-common';

/** Drawn: show cards 150 x 180 (cover 120), Premium cards 260 x 96 (cover 72), Video cards 260 x 150. */
export const SHOW_CARD = { width: 150, height: 180, cover: 120 } as const;
export const PREMIUM_CARD = { width: 260, height: 96, cover: 72 } as const;
export const VIDEO_CARD = { width: 260, height: 150 } as const;
const FOOT = [colour.clear, colour.scrimFoot] as const;
const FOOT_AT = [0.4, 1] as const;

type Tile = { feedUrl: string; title: string; imageUrl?: string; line?: string };

/** Show cards — a cover, the name, one caption. */
export function ShowTiles(props: { title: string; shows: Tile[]; onShow: (feedUrl: string) => void; /** The drawn edge label ("Shows"; "Popular" for the second deck so the two are told apart). */ short?: string; /** The caption when a show has no line of its own. */ caption?: string }): React.ReactElement | null {
  const edge = useEdge(props.title, props.short ?? 'Shows');
  if (props.shows.length === 0) return null;
  return (
    <DeckSection {...edge}>
      <Deck width={SHOW_CARD.width} height={SHOW_CARD.height}>
        {props.shows.map((s) => (
          <DeckCard key={s.feedUrl}>
            <Pressable onPress={() => props.onShow(s.feedUrl)} accessibilityRole="button" accessibilityLabel={s.line ? `${s.title}. ${s.line}` : s.title} className="flex-1">
              <CoverBand url={s.imageUrl} name={s.title} height={SHOW_CARD.cover} />
              <Box style={{ paddingHorizontal: spacing.row, paddingVertical: PX.ten }}>
                <Type step="compact" className="text-text font-bold" numberOfLines={1}>{s.title}</Type>
                {s.line ?? props.caption ? <Type step="caption" className="text-text2" numberOfLines={1}>{s.line ?? props.caption}</Type> : null}
              </Box>
            </Pressable>
          </DeckCard>
        ))}
      </Deck>
    </DeckSection>
  );
}

export const popularShowTiles = (shows: ShowCard[]): Tile[] => shows.map((s) => ({ feedUrl: s.feedUrl, title: s.title, ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}), line: s.author }));

/**
 * Owner, 2026-10-05 — "Premium picks", where 小宇宙 has its 付费精品节目单: a deck of show cards, each
 * with a "PREMIUM" tag. No price and no buy button — the app sells nothing here (constitution 2.1.0);
 * a card opens the show page like any other show.
 */
export function PremiumSection(props: { shows: ShowCard[]; onShow: (feedUrl: string) => void }): React.ReactElement | null {
  const edge = useEdge('Premium picks', 'Premium');
  if (props.shows.length === 0) return null;
  return (
    <DeckSection {...edge}>
      <Deck width={PREMIUM_CARD.width} height={PREMIUM_CARD.height}>
        {props.shows.map((s) => (
          <DeckCard key={s.feedUrl} tone="premium">
            <Pressable onPress={() => props.onShow(s.feedUrl)} accessibilityRole="button" accessibilityLabel={`${s.title}, ${s.author}. Premium pick`} className="flex-1 flex-row items-center" style={{ padding: spacing.row, gap: spacing.row }}>
              <Artwork url={s.imageUrl} size={PREMIUM_CARD.cover} name={s.title} />
              <Box className="flex-1 min-w-0" style={{ gap: spacing.hair }}>
                <Box className="self-start bg-violet/25 rounded-chip" style={{ paddingHorizontal: PX.six, paddingVertical: PX.three }}>
                  <Type step="badge" className="text-hotEnd">PREMIUM</Type>
                </Box>
                <Type step="row" className="text-text font-bold" numberOfLines={1}>{s.title}</Type>
                <Type step="caption" className="text-text2" numberOfLines={1}>{s.author}</Type>
              </Box>
            </Pressable>
          </DeckCard>
        ))}
      </Deck>
    </DeckSection>
  );
}

/** M10b US5 — "Podcasts you can watch": video episodes as cover cards, each opening its episode. */
export function VideoSection(props: Act & { items: DiscoverItem[] }): React.ReactElement | null {
  const edge = useEdge('Podcasts you can watch', 'Video');
  if (props.items.length === 0) return null;
  return (
    <DeckSection {...edge}>
      <Deck width={VIDEO_CARD.width} height={VIDEO_CARD.height}>
        {props.items.map((i) => (
          <DeckCard key={i.key}>
            <Pressable onPress={() => props.onOpen(i.episode)} accessibilityRole="button" accessibilityLabel={`Video: ${i.episode.title}, ${i.episode.showTitle}`} className="flex-1">
              <CoverBand url={i.episode.imageUrl} name={i.episode.showTitle} height={VIDEO_CARD.height - 2} />
              <LinearGradient colors={FOOT} locations={FOOT_AT} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
              <Box className="absolute" style={{ left: spacing.row, top: spacing.row }}><Icon name="videocam-outline" size={22} color={colour.text} /></Box>
              <Box className="absolute" style={{ left: spacing.row, right: spacing.row, bottom: spacing.row }}>
                <Type step="row" className="text-text font-bold" numberOfLines={1}>{i.episode.title}</Type>
                <Type step="caption" className="text-text2" numberOfLines={1}>{i.episode.showTitle}</Type>
              </Box>
            </Pressable>
          </DeckCard>
        ))}
      </Deck>
    </DeckSection>
  );
}
