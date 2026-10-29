// Starred episodes (a mosaic of covers) and starred comments (a thread), in two tabs, with search.
/**
 * Favourites (我的收藏, M10; tabs M10b US2): Episodes you starred on their page, and
 * Comments you starred with ☆ — each newest first, both searchable, both following the
 * account (src/sync/library.ts).
 *
 * M31 W3-C (T041; design-pulse2 `shell.html` `favourites--screen`, `favourites--empty`, `favourites--comments-empty` and
 * `listen.html` `favourites--comments-tab`): the foot of the page is the thumb zone — back and "Favourites" (28), then the
 * search field (48, only when there is something to search) and the switch "Episodes · 6 | Comments · 3" (44 track, the
 * chosen choice light). Episodes are a mosaic under the edge label "Starred": two columns, rows of 92, the newest tile 1 x 2,
 * the cover filling each tile, a hot star at its top right, the title and show on a fade at its foot. Comments hang from
 * the spine at their moment chips with the episode beside each; "This comment was deleted" when gone. Nothing yet: the
 * Stage's glowing star tile and "No favourite comments yet" beside an empty spine. Same rows, links and spoken names.
 *
 * The two drawings disagree about the switch (`favourites--comments-tab` puts an underline switch above the title, as
 * Updates; `favourites--screen` a pill switch in the foot): the pill is built, for both tabs, so the control is one thing.
 * Not as drawn: a comment's age is when you starred it (the saved copy keeps no other); no like count; the empty
 * Comments page's glow is not colour-swapped.
 */
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { colour, spacing } from '@/design';
import { listFavComments, type FavComment } from '@/me/fav-comments';
import { listFavourites, type Favourite } from '@/me/favourites';
import { matchesAll } from '@/me/history';
import { Avatar } from '@/ui/kit/Avatar';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { Icon } from '@/ui/kit/Icon';
import { mmss } from '@/ui/kit/format';
import { PushedPage } from '@/ui/kit/PushedPage';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { Tick } from '@/ui/comments/Spine';
import { useStores } from '@/ui/shell/providers';
import { EndOfList } from '@/ui/kit/EndOfList';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { ME_TYPE } from '@/ui/me/measures';
import { ageLabel, ArtTile, DRAWN, emptyTop, EmptySpine, GlowTile, KeyboardPage, LIST, mosaicColumn, SearchField, SegmentSwitch, ThreadCard, ThreadNode, ThreadSpine, threadPad } from '@/ui/me/lists';

/** The Favourites mosaic's rows are 92 (the Me tab's are 84); the newest tile is two of them and the gap between. */
const ROW = 92;
const TALL = ROW * 2 + ME_MOSAIC.gap;
/** The foot: the switch is 44, the field 48. */
const SWITCH = 44;

type Tab = 'episodes' | 'comments';

/** "No favourites yet — star an episode on its page" → the title and the line under it. */
function split(sentence: string): { title: string; line: string } {
  const m = /^(.+?)( — |\. )(.+)$/.exec(sentence);
  if (!m) return { title: sentence, line: '' };
  const rest = m[3]!;
  return { title: m[1]! + (m[2] === '. ' ? '.' : ''), line: rest.charAt(0).toUpperCase() + rest.slice(1) };
}

export default function FavouritesScreen(): React.ReactElement {
  const stores = useStores();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('episodes');
  const [rows, setRows] = useState<Favourite[]>(() => listFavourites(stores.settings));
  const [comments, setComments] = useState<FavComment[]>(() => listFavComments(stores.settings));
  const [term, setTerm] = useState('');
  useFocusEffect(useCallback(() => { setRows(listFavourites(stores.settings)); setComments(listFavComments(stores.settings)); }, [stores]));
  const known = rows.map((f) => ({ f, e: stores.feeds.getEpisode(f.episodeId) }))
    .filter((r) => r.e !== undefined && matchesAll(term, [r.e.title, stores.feeds.getShow(r.e.feedUrl)?.title]));
  const starred = comments.filter((c) => matchesAll(term, [c.body, c.author, stores.feeds.getEpisode(c.episodeId)?.title]));
  const any = tab === 'episodes' ? rows.length > 0 : comments.length > 0;
  const col = mosaicColumn(width);
  const now = Date.now();

  // M12 FR-097 kept the two tabs; M31: the pill switch in the foot, with each tab's count (same two tabs, same handler).
  const below = (
    <>
      {any ? <SearchField value={term} onChange={setTerm} placeholder="Search your favourites" /> : null}
      <SegmentSwitch
        items={[
          { value: 'episodes' as const, label: `Episodes · ${rows.length}`, accessibilityLabel: 'Episodes' },
          { value: 'comments' as const, label: `Comments · ${comments.length}`, accessibilityLabel: 'Comments' },
        ]}
        value={tab}
        onChange={setTab}
      />
    </>
  );

  return (
    <KeyboardPage>
      <PushedPage title="Favourites" size={28} below={below} belowHeight={SWITCH + (any ? LIST.field + spacing.row : 0)}>
        {(layout) => {
          const listTop = layout.top + (DRAWN.listTop - DRAWN.status);
          if (tab === 'comments') {
            return (
              <Box className="flex-1" style={{ paddingTop: listTop }}>
                {starred.length === 0 ? (
                  <EmptySpine top={layout.top + (LIST.emptySpineTop - DRAWN.status)} height={380} />
                ) : <ThreadSpine top={listTop} />}
                <FlatList
                  key="comments"
                  className="flex-1"
                  data={starred}
                  ListFooterComponent={starred.length > 0 ? <EndOfList /> : undefined}
                  keyExtractor={(c) => c.commentId}
                  contentContainerStyle={{ ...threadPad(layout.reserve), flexGrow: 1 }}
                  keyboardShouldPersistTaps="handled"
                  ItemSeparatorComponent={() => <Box style={{ height: LIST.nodeGap }} />}
                  ListEmptyComponent={
                    term ? (
                      <Box style={{ marginTop: emptyTop(180) - LIST.top, marginLeft: 20, marginRight: 24 }}><Type step="lede" className="text-text">Nothing matches</Type></Box>
                    ) : (
                      <Box testID="comments-empty" style={{ marginTop: emptyTop(180) - LIST.top, marginLeft: 20, marginRight: 24, gap: spacing.gap }}>
                        <Icon name="chatbubble-outline" size={30} color={colour.hotText} />
                        <Type step="lede" className="text-text font-extrabold" style={ME_TYPE.stage22}>{split('No favourite comments yet — tap ☆ on a comment').title}</Type>
                        <Type step="body" className="text-text2">{split('No favourite comments yet — tap ☆ on a comment').line}</Type>
                      </Box>
                    )
                  }
                  renderItem={({ item }) => {
                    const e = stores.feeds.getEpisode(item.episodeId);
                    return (
                      <ThreadNode
                        lead={item.offsetMs !== null ? <TimestampChip text={mmss(item.offsetMs)} solid /> : <Tick text="no moment" />}
                        label={<Type step="caption" className="text-text2 flex-1" style={ME_TYPE.node12} numberOfLines={1}>{e?.title ?? ''}</Type>}
                      >
                        <Pressable
                          onPress={() => router.push({ pathname: '/episode/[id]', params: { id: item.episodeId, ...(item.offsetMs !== null ? { at: String(item.offsetMs) } : {}) } })}
                          accessibilityRole="button"
                          accessibilityLabel={`${item.author}: ${item.body}`}
                        >
                          <ThreadCard>
                            {item.body ? (
                              <>
                                <Box className="flex-row items-center" style={{ gap: spacing.gap }}>
                                  <Avatar size={24} name={item.author} />
                                  <Type step="compact" className="text-text" numberOfLines={1}>{item.author}</Type>
                                  <Type step="mono" className="text-text3" style={ME_TYPE.mono11}>{ageLabel(item.at, now)}</Type>
                                </Box>
                                <Type step="body" className="text-text" numberOfLines={4}>{item.body}</Type>
                                <Box className="flex-row items-center" style={{ gap: spacing.hair + 2 }}>
                                  <Icon name="star" size={14} color={colour.warn} />
                                  <Type step="caption" className="text-warn" style={ME_TYPE.node12}>Favourite</Type>
                                </Box>
                              </>
                            ) : (
                              <Type step="note" className="text-text3 italic">This comment was deleted</Type>
                            )}
                          </ThreadCard>
                        </Pressable>
                      </ThreadNode>
                    );
                  }}
                />
              </Box>
            );
          }
          // Episodes: the mosaic. The newest is the 1 x 2 tile at the left, the next two stack at its right, then rows of two.
          const tile = (r: (typeof known)[number], height: number) => {
            const e = r.e!;
            const show = stores.feeds.getShow(e.feedUrl);
            return (
              <Link key={r.f.episodeId} href={{ pathname: '/episode/[id]', params: { id: e.id } }} asChild>
                <Pressable accessibilityRole="button" accessibilityLabel={e.title}>
                  <ArtTile
                    url={e.imageUrl ?? show?.imageUrl}
                    name={show?.title ?? e.title}
                    width={col}
                    height={height}
                    testID="fav-tile"
                    corner={<Icon name="star" size={18} color={colour.hot} />}
                  >
                    <Type step="caption" className="text-text font-bold" style={ME_TYPE.tile13} numberOfLines={2}>{e.title}</Type>
                    <Type step="caption" className="text-quote" style={ME_TYPE.show11} numberOfLines={1}>{show?.title ?? ''}</Type>
                  </ArtTile>
                </Pressable>
              </Link>
            );
          };
          const head = known.slice(0, 3);
          const rest = known.slice(3);
          const pairsOf: (typeof known)[] = [];
          for (let i = 0; i < rest.length; i += 2) pairsOf.push(rest.slice(i, i + 2));
          return (
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: layout.top + (60 - DRAWN.status), paddingBottom: layout.reserve }}>
              {known.length === 0 ? (
                <Box className="items-center" style={{ marginTop: 140 - 60 }} testID="fav-empty">
                  {term ? (
                    <Box style={{ marginTop: 160 }}><Type step="lede" className="text-text">Nothing matches</Type></Box>
                  ) : (
                    <>
                      <GlowTile icon="star-outline" size={110} rotate={-6} />
                      <Box className="items-center" style={{ marginTop: 300 - 140 - 110, paddingHorizontal: 24, gap: spacing.gap }}>
                        <Type step="statement" className="text-text font-extrabold text-center" style={ME_TYPE.stage24}>{split('No favourites yet — star an episode on its page').title}</Type>
                        <Type step="body" className="text-text2 text-center">{split('No favourites yet — star an episode on its page').line}</Type>
                      </Box>
                    </>
                  )}
                </Box>
              ) : (
                <>
                  <EdgeLabel label="Starred" top={20} />
                  <Box style={{ marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right, gap: ME_MOSAIC.gap }}>
                    <Box className="flex-row" style={{ gap: ME_MOSAIC.gap }}>
                      {head[0] ? tile(head[0], TALL) : null}
                      <Box style={{ gap: ME_MOSAIC.gap }}>
                        {head[1] ? tile(head[1], ROW) : null}
                        {head[2] ? tile(head[2], ROW) : null}
                      </Box>
                    </Box>
                    {pairsOf.map((p) => (
                      <Box key={p[0]!.f.episodeId} className="flex-row" style={{ gap: ME_MOSAIC.gap }}>
                        {p.map((r) => tile(r, ROW))}
                      </Box>
                    ))}
                  </Box>
                  <EndOfList />
                </>
              )}
            </ScrollView>
          );
        }}
      </PushedPage>
    </KeyboardPage>
  );
}
