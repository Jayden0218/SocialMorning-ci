// Show info: who stands behind the show, the owner's country, and the feed address to copy.
/**
 * M21 US5 (FR-041), opened from the show page's ⋯. One server call (`GET /v1/shows/info`):
 * whether the show was made in our Studio, claimed by its owner, or is only a public feed; the
 * owner's IP location as a country (two letters, never more — guard G-I1), and since when it is
 * claimed. The feed address is shown in full with a Copy button. Offline, the page still shows
 * the feed address (Principle IV) and says the rest could not load.
 */
import { useEffect, useState } from 'react';
import { Clipboard } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card, CardDivider } from '@/ui/kit/Card';
import { Loader } from '@/ui/kit/Loader';
import { Icon } from '@/ui/kit/Icon';
import { TAP } from '@/ui/kit/TopBar';
import { useColours } from '@/ui/kit/useColours';
import { useSocial } from '@/social/context';
import { useStores, useToast } from '@/ui/shell/providers';
import { shortDate } from '@/ui/kit/format';
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

function Line(props: { label: string; value: string }): React.ReactElement {
  return (
    <Box className="py-row gap-0.5" accessible accessibilityLabel={`${props.label}: ${props.value}`}>
      <Text className="text-muted text-xs">{props.label}</Text>
      <Text className="text-text text-body">{props.value}</Text>
    </Box>
  );
}

export default function ShowInfoScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ feedUrl: string }>();
  const feedUrl = decodeURIComponent(params.feedUrl ?? '');
  const stores = useStores();
  const c = useColours(stores.settings);
  const toast = useToast();
  const { api } = useSocial();
  const [info, setInfo] = useState<ShowInfo | 'failed' | undefined>();
  useEffect(() => {
    let live = true;
    api.showInfo(feedUrl).then((r) => { if (live) setInfo(r); }, () => { if (live) setInfo('failed'); });
    return () => { live = false; };
  }, [api, feedUrl]);
  const title = stores.feeds.getShow(feedUrl)?.title;
  return (
    <>
      <PageHeader title="Show info" {...(title ? { subtitle: title } : {})} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-section gap-section">
        <Card>
          {info === undefined ? <Box className="items-center py-row"><Loader /></Box> : info === 'failed' ? (
            <Text className="text-muted text-body py-row">Couldn't load who owns this show. Check your connection and try again.</Text>
          ) : (
            <>
              <Line label="Owner" value={OWNER_LABEL[info.ownerType]} />
              {info.ownerType === 'feed' ? null : (
                <>
                  <CardDivider />
                  <Line label="Owner's IP location" value={countryName(info.ownerCountry)} />
                </>
              )}
              {info.claimedAt ? (
                <>
                  <CardDivider />
                  <Line label={info.ownerType === 'studio' ? 'Made on' : 'Claimed on'} value={shortDate(Date.parse(info.claimedAt))} />
                </>
              ) : null}
            </>
          )}
        </Card>
        <Card>
          <Text className="text-muted text-xs pt-row">Feed address</Text>
          <Text className="text-text text-body py-1" selectable>{feedUrl}</Text>
          <Pressable onPress={() => { Clipboard.setString(feedUrl); toast('Feed address copied.'); }} accessibilityRole="button" accessibilityLabel="Copy the feed address" className="flex-row items-center gap-gap self-start" style={TAP}>
            <Icon name="copy-outline" size={18} color={c.accent} />
            <Text className="text-accent text-body font-bold">Copy</Text>
          </Pressable>
        </Card>
      </ScrollView>
    </>
  );
}
