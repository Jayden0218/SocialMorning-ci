// Show info: who stands behind the show, the owner's country, and the feed address to copy.
/**
 * M21 US5 (FR-041), opened from the show page's ⋯. One server call (`GET /v1/shows/info`):
 * whether the show was made in our Studio, claimed by its owner, or is only a public feed; the
 * owner's IP location as a country (two letters, never more — guard G-I1), and since when it is
 * claimed. The feed address is shown in full with a Copy button. Offline, the page still shows
 * the feed address (Principle IV) and says the rest could not load.
 *
 * M31 W3-A (T040; design-pulse2 `show-info--screen`, `-loading`, `-error`, `toast--show-info`; layout Panel): a pushed page
 * (`PushedPage`: the glow, the title bar low — "Show info", the show's name, back). The tiles start 70 under the top, the edge
 * label "Feed" on the left, content 28 in. Tile 1: Feed address with the address under it and a Copy pill ("Feed address
 * copied."). Tile 2: Owner ("Made in the SocialNet Studio" / "Claimed by its owner" / "A public podcast feed, not claimed
 * here"), Claimed on / Made on, Owner's IP location (or "Not known"). The owner's name in the drawing is not in the app's data
 * (the server answers the kind, the country and the date only), so the Owner row has the kind alone. While the lookup is slow the
 * feed tile shows at once (it is on the phone) and the owner tile breathes as a ghost; a failed lookup is an inline error tile and
 * the feed address still works — leaving and returning retries.
 */
import { useEffect, useState } from 'react';
import { Clipboard } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { useSocial } from '@/social/context';
import { useStores, useToast } from '@/ui/shell/providers';
import { dayMonth } from '@/ui/kit/format';
import { InfoError, InfoGhost, InfoGroup, type InfoRowSpec } from '@/ui/show/InfoGroup';
import { EPISODE } from '@/ui/episode/measures';
import type { ShowInfo } from '@/social/api';

export const OWNER_LABEL: Record<ShowInfo['ownerType'], string> = {
  studio: 'Made in the SocialNet Studio',
  claimed: 'Claimed by its owner',
  feed: 'A public podcast feed, not claimed here',
};

/** "Malaysia" for "MY" where the phone knows the name; the two letters otherwise. */
export function countryName(code: string | null): string {
  if (!code) return 'Not known';
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}

/** The owner tile's rows for an answer (pure — tested). */
export function ownerRows(info: ShowInfo): InfoRowSpec[] {
  const rows: InfoRowSpec[] = [{ icon: 'person-outline', title: 'Owner', detail: OWNER_LABEL[info.ownerType] }];
  if (info.claimedAt) rows.push({ icon: 'time-outline', title: info.ownerType === 'studio' ? 'Made on' : 'Claimed on', detail: dayMonth(Date.parse(info.claimedAt), true) });
  if (info.ownerType !== 'feed') rows.push({ icon: 'pin', title: "Owner's IP location", detail: countryName(info.ownerCountry) });
  return rows;
}

export default function ShowInfoScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ feedUrl: string }>();
  const feedUrl = decodeURIComponent(params.feedUrl ?? '');
  const stores = useStores();
  const toast = useToast();
  const { api } = useSocial();
  const [info, setInfo] = useState<ShowInfo | 'failed' | undefined>();
  useEffect(() => {
    let live = true;
    api.showInfo(feedUrl).then((r) => { if (live) setInfo(r); }, () => { if (live) setInfo('failed'); });
    return () => { live = false; };
  }, [api, feedUrl]);
  const title = stores.feeds.getShow(feedUrl)?.title;
  const feedTile: InfoRowSpec = {
    icon: 'globe-outline',
    title: 'Feed address',
    detail: feedUrl,
    selectable: true,
    right: <PulseButton label="Copy" accessibilityLabel="Copy the feed address" kind="quiet" onPress={() => { Clipboard.setString(feedUrl); toast('Feed address copied.'); }} />,
  };
  return (
    <PushedPage title="Show info" {...(title ? { subtitle: title } : {})}>
      {(layout) => (
        <ScrollView testID="show-info-scroll" className="flex-1" contentContainerStyle={{ paddingBottom: layout.reserve }}>
          {/* The tiles start 70 under the top of the drawn 50 pt status bar: 20 under the bar. */}
          <Box style={{ marginTop: layout.top + EPISODE.infoTop - EPISODE.statusBar }}>
          <EdgeLabel label="Feed" top={0} />
          <Box testID="show-info-tiles" className="gap-row" style={{ marginLeft: EPISODE.lane, marginRight: EPISODE.right }}>
            <InfoGroup rows={[feedTile]} />
            {info === undefined ? <InfoGhost rows={4} /> : info === 'failed' ? (
              <InfoError>Couldn't load who owns this show. Check your connection and try again.</InfoError>
            ) : <InfoGroup rows={ownerRows(info)} />}
          </Box>
          </Box>
        </ScrollView>
      )}
    </PushedPage>
  );
}
