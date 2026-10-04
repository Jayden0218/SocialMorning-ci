// One curated issue: editor's intro, then numbered picks with the editor's notes.
/**
 * One curated issue (M12 FR-101): the editor's intro, then numbered picks, each with the
 * editor's note. From the same curation file as Editor's picks (`picks.json`). A pick the
 * server cannot name as an episode yet keeps its note and opens the show.
 *
 * M17 T096 (`Issue-B`): the back row alone, then a heavy rule over an accent "Issue · date"
 * eyebrow, the issue's title in large serif and the intro in serif. Each pick is a white
 * card: a tinted tile with the serif number (and the show's artwork) that opens the episode
 * with the show and title under it, the round Play beside them, then the editor's note as a
 * serif italic quote. A pick with no episode keeps "Open the show →" under its tile. Loading,
 * Retry, the hidden-show filter and the pick order are unchanged.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { Loader } from '@/ui/kit/Loader';
import { Screen } from '@/ui/kit/Screen';
import { Card } from '@/ui/kit/Card';
import { Artwork } from '@/ui/kit/Artwork';
import { PlayButton } from '@/ui/discover/parts';
import { useCardActions } from '@/discover/useDiscover';
import { dayTitle } from '@/discover/sections';
import { useSafety } from '@/safety/context';
import { useM12Api, type Issue } from '@/social/m12-api';
import { PageHeader } from '@/ui/kit/PageHeader';

const TAP = { minHeight: hit.min };
/** `Issue-B`: the pick's tile is 112 pt high with a 44 pt serif number. */
const TILE = { height: 112 };
const NUMBER = { fontSize: 44, lineHeight: 48 };
const CAPS = { letterSpacing: 1.3, textTransform: 'uppercase' as const };
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; issue: Issue };

/** The tinted tile with the pick's number; decoration — the name is on the Pressable around it. */
function Tile(props: { n: number; imageUrl?: string | null | undefined; showTitle?: string }): React.ReactElement {
  return (
    <Box className="bg-accentTint rounded-row p-row flex-row items-end justify-between" style={TILE} accessible={false} importantForAccessibility="no-hide-descendants">
      <Text className="text-text font-display" style={NUMBER} maxFontSizeMultiplier={1.3}>{String(props.n).padStart(2, '0')}</Text>
      {props.showTitle !== undefined ? <Artwork url={props.imageUrl ?? null} size={48} name={props.showTitle} /> : null}
    </Box>
  );
}

export default function IssueScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const m12 = useM12Api();
  const { open, play } = useCardActions();
  const { hiddenFeeds } = useSafety();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(() => {
    setState({ kind: 'loading' });
    m12.issue(String(id)).then((issue) => setState({ kind: 'ok', issue }), () => setState({ kind: 'error' }));
  }, [m12, id]);
  useEffect(() => { load(); }, [load]);
  const items = state.kind === 'ok' ? [...state.issue.items].sort((a, b) => a.order - b.order).filter((i) => !hiddenFeeds.has(i.feedUrl)) : [];
  return (
    <>
    <PageHeader middle={<Box />} />
    <Screen scroll className="pt-1">
      <Box className="border-t-[3px] border-text pt-2.5 gap-1.5">
        {state.kind === 'ok' ? (
          <>
            <Text className="text-accent text-micro font-bold" style={CAPS}>Issue · {dayTitle(state.issue.date)}</Text>
            <Text className="text-text text-display font-display" accessibilityRole="header">{state.issue.title}</Text>
            {state.issue.intro ? <Text className="text-text text-title font-display-semibold mt-1 leading-[25px]">{state.issue.intro}</Text> : null}
          </>
        ) : <Text className="text-text text-display font-display" accessibilityRole="header">Issue</Text>}
      </Box>
      {state.kind === 'loading' ? <Loader className="my-section" /> : null}
      {state.kind === 'error' ? (
        <Box className="items-center my-section">
          <Text className="text-muted text-sm">Couldn't load this issue.</Text>
          <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center" style={TAP}><Text className="text-accent text-sm font-semibold">Retry</Text></Pressable>
        </Box>
      ) : null}
      {items.map((it, i) => {
        const card = it.episode;
        return (
          <Card key={`${it.order}-${it.feedUrl}`} padded={false} className="p-row mt-3.5 gap-1.5">
            {card ? (
              <Box>
                <Pressable onPress={() => void open(card)} accessibilityRole="button" accessibilityLabel={`${card.title}, ${card.showTitle}`} style={TAP}>
                  <Tile n={i + 1} imageUrl={card.imageUrl} showTitle={card.showTitle} />
                  <Box className="mt-2.5 pr-14">
                    <Text className="text-muted text-xs" numberOfLines={1}>{card.showTitle}</Text>
                    <Text className="text-text text-body font-bold" numberOfLines={2}>{card.title}</Text>
                  </Box>
                </Pressable>
                <Box className="absolute right-0 bottom-0">
                  <PlayButton title={card.title} onPress={() => void play(card)} />
                </Box>
              </Box>
            ) : (
              <>
                <Tile n={i + 1} />
                <Pressable onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(it.feedUrl) } })} accessibilityRole="link" accessibilityLabel="Open the show" className="justify-center" style={TAP}>
                  <Text className="text-accent text-sm font-semibold">Open the show →</Text>
                </Pressable>
              </>
            )}
            {it.note ? <Text className="text-muted text-body font-display-semibold italic leading-[22px]">“{it.note}”</Text> : null}
          </Card>
        );
      })}
    </Screen>
    </>
  );
}
