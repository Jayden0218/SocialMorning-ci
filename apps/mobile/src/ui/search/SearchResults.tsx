// What a result page shows under the tabs: notices, the empty state, and the chosen tab's results.
/**
 * M31 T030 (split out of SearchPage.tsx, review D7). Pure drawing: the page hands it the data and the actions.
 *   All — a deck each of Shows (3), Episodes (5) and a few People (F2a: no Moments deck, as drawn), each with "More … ›" when its tab has more;
 *   Shows — the mosaic; Episodes — the cards one under another; Moments — the tiles (NEW); People — avatar tiles.
 * Notices (a catalogue that needs a connection, episode search down) are one warn line each, 28 from the left.
 * Nothing found: the shared empty block and "Can't find it? Tell us" (`TellEditors`).
 */
import { Box } from '@/ui/lib/box';
import { colour, spacing } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { Loader } from '@/ui/kit/Loader';
import { EmptyState } from '@/ui/kit/EmptyState';
import { Type } from '@/ui/kit/Type';
import { DECK, PX } from '@/ui/discover/Deck';
import type { Moment } from '@/discover/moments-api';
import type { RichEpisode } from '@/discover/explore-api';
import type { ShowCard } from '@/social/api';
import { TellEditors } from './TellEditors';
import { EpisodeDeck, EpisodeList, type EpisodeActions } from './EpisodeResults';
import { MomentGrid, type MomentResultsState } from './MomentResults';
import { PeopleGrid, PeoplePreview, type Person } from './PeopleResults';
import { ShowDeck, ShowMosaic, type ShowActions } from './ShowResults';
import { BLOCK_TOP, type Tab } from './search-tabs';

/** On "All", this many shows sit above the episodes; the Shows tab has the rest. */
export const ALL_SHOWS = 3;
/** Owner, 2026-10-01: on "All", at most this many episodes; the Episodes tab has the rest. */
export const ALL_EPISODES = 5;
/** On "All", this many people. (Moments are their own tab: the drawn All tab has none — F2a.) */
export const ALL_PEOPLE = 4;

export type CatalogueNotice = { kind: 'idle' | 'loading' | 'ok' | 'error'; message?: string; episodeSearchDown?: boolean };
export type PeopleView = { loading: boolean; error?: string; people: Person[]; loaded: boolean };

function Warn(props: { text: string }): React.ReactElement {
  return (
    <Box className="flex-row items-start" style={{ marginLeft: DECK.lane, marginRight: spacing.section, marginBottom: spacing.row, gap: PX.ten }}>
      <Icon name="alert-circle-outline" size={20} color={colour.warn} />
      <Type step="note" className="flex-1 text-text" accessibilityLiveRegion="polite">{props.text}</Type>
    </Box>
  );
}

export function SearchResults(props: {
  tab: Tab;
  onTab: (t: Tab) => void;
  term: string;
  catalogue: CatalogueNotice;
  shows: readonly ShowCard[];
  episodes: readonly RichEpisode[];
  nothing: boolean;
  /** Where the page's content starts below the screen's top (the status bar and the gap), so a centred block lands where it is drawn. */
  top?: number;
  showActions: ShowActions;
  episodeActions: EpisodeActions;
  moments: MomentResultsState;
  onPlayMoment: (m: Moment) => void;
  people: PeopleView;
  onOpenPerson: (p: Person) => void;
}): React.ReactElement {
  const { tab, catalogue } = props;
  const loading = catalogue.kind === 'loading';
  const settled = !loading;
  return (
    <Box>
      {tab !== 'people' && tab !== 'moments' ? (
        <>
          {loading ? <Loader className="my-section" /> : null}
          {catalogue.kind === 'error' && catalogue.message ? <Warn text={catalogue.message} /> : null}
          {catalogue.episodeSearchDown ? <Warn text="Episode search is unavailable right now — shows only." /> : null}
          {/* M31 F2a (design-pulse2 `search--empty`): the block starts at 160 from the screen's top, not under the tabs. */}
          {props.nothing ? (
            <Box testID="search-empty-block" style={{ marginTop: Math.max(0, BLOCK_TOP.empty - (props.top ?? 0)) }}>
              <EmptyState surface="search" page />
              {/* M22 US17 item 3: send the words to the editors. */}
              <TellEditors key={props.term} q={props.term} />
            </Box>
          ) : null}
        </>
      ) : null}

      {tab === 'all' ? (
        <>
          <ShowDeck shows={props.shows.slice(0, ALL_SHOWS)} term={props.term} actions={props.showActions} more={props.shows.length > ALL_SHOWS} onMore={() => props.onTab('shows')} />
          <EpisodeDeck episodes={props.episodes.slice(0, ALL_EPISODES)} term={props.term} actions={props.episodeActions} more={props.episodes.length > ALL_EPISODES} onMore={() => props.onTab('episodes')} />
          <PeoplePreview people={props.people.people.slice(0, ALL_PEOPLE)} term={props.term} onOpen={props.onOpenPerson} more={props.people.people.length > ALL_PEOPLE} onMore={() => props.onTab('people')} />
        </>
      ) : null}

      {tab === 'shows' ? (
        settled && props.shows.length === 0 && !props.nothing
          ? <Type step="lede" className="text-text font-bold" style={{ marginLeft: DECK.lane, marginTop: spacing.block }}>No shows match.</Type>
          : <ShowMosaic shows={props.shows} term={props.term} actions={props.showActions} />
      ) : null}

      {tab === 'episodes' ? (
        settled && props.episodes.length === 0 && !props.nothing
          ? <Type step="lede" className="text-text font-bold" style={{ marginLeft: DECK.lane, marginTop: spacing.block }}>No episodes match.</Type>
          : <EpisodeList episodes={props.episodes} term={props.term} actions={props.episodeActions} />
      ) : null}

      {tab === 'moments' ? <MomentGrid results={props.moments} onPlay={props.onPlayMoment} /> : null}

      {tab === 'people' ? (
        <>
          {props.people.error ? <Warn text={props.people.error} /> : null}
          <PeopleGrid people={props.people.people} term={props.term} loading={props.people.loading} none={props.people.loaded && props.people.people.length === 0} noneTop={Math.max(0, BLOCK_TOP.people - (props.top ?? 0))} onOpen={props.onOpenPerson} />
        </>
      ) : null}
    </Box>
  );
}
