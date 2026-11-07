// The shows another listener subscribes to, unless they keep them private.
/**
 * M21 US8 (FR-074, G-M21-10): `GET /v1/listeners/:id/subscriptions`. A 403 `private` (they keep
 * their subscriptions private, or a block stands between you) shows a Private state and no shows.
 * Each show opens its page. Order: their own "Default" order, then newest first (the server's).
 *
 * M31 W4-A (T050; design-pulse2 social.html `profile-subscriptions--screen`, `--private`, `--empty`; layout pattern Mosaic): each show is a
 * 1 x 2 cover tile (178 tall, in the Me tab's lane), its title in Unbounded 700 14 on the fade at its foot; the edge label is "Shows".
 * The title bar says "Subscriptions" and "Shows Rui Costa follows" ("Shows they follow" with no name). Private: a 64 disc with a lock and
 * "<name> keeps their subscriptions private."; none: the empty block "No shows yet."; a failure: the disc with a wifi mark, the line
 * "Couldn't load the shows right now." and a light Retry.
 */
import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { EndOfList } from '@/ui/kit/EndOfList';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { ArtTile, DRAWN, PageEmpty, emptyTop, mosaicColumn } from '@/ui/me/lists';
import { CenterBlock, GhostTiles, IconBlock, MosaicList } from '@/ui/profile/parts';
import { PROFILE, PROFILE_TYPE } from '@/ui/profile/measures';
import { useUs8Api, type PublicShow } from '@/social/us8-api';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'private' } | { kind: 'ok'; items: PublicShow[] };

export default function ListenerSubscriptionsScreen(): React.ReactElement {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const us8 = useUs8Api();
  const { width } = useWindowDimensions();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(() => {
    us8.listenerSubscriptions(String(id))
      .then((r) => setState(r.private ? { kind: 'private' } : { kind: 'ok', items: r.items }))
      .catch(() => setState((s) => (s.kind === 'ok' ? s : { kind: 'error' })));
  }, [us8, id]);
  useFocusEffect(load);
  const whose = typeof name === 'string' && name !== '' ? name : 'This listener';
  const col = mosaicColumn(width);
  return (
    <PushedPage title="Subscriptions" subtitle={`Shows ${whose === 'This listener' ? 'they follow' : `${whose} follows`}`} tone={state.kind === 'error' ? 'grey' : 'hot'}>
      {(layout) => {
        if (state.kind === 'private') {
          return <Box className="flex-1"><CenterBlock top={layout.top} drawn={250}><IconBlock icon="lock-closed-outline" line={`${whose} keeps their subscriptions private.`} /></CenterBlock></Box>;
        }
        if (state.kind === 'error') {
          return <Box className="flex-1"><CenterBlock top={layout.top} drawn={250}><IconBlock icon="wifi" failure line="Couldn't load the shows right now."><PulseButton label="Retry" kind="light" onPress={() => { setState({ kind: 'loading' }); load(); }} full /></IconBlock></CenterBlock></Box>;
        }
        if (state.kind === 'ok' && state.items.length === 0) {
          return <Box className="flex-1" style={{ paddingTop: layout.top + (DRAWN.listTop - DRAWN.status) }}><PageEmpty top={emptyTop(240)} title="No shows yet" line="No shows yet." /></Box>;
        }
        return (
          <MosaicList
            data={state.kind === 'ok' ? state.items : []}
            keyOf={(s) => s.feedUrl}
            top={layout.top}
            reserve={layout.reserve}
            labels={state.kind === 'ok' ? [{ text: 'Shows', top: PROFILE.labelTop }] : []}
            {...(state.kind === 'loading' ? { header: <GhostTiles count={4} rows={PROFILE.showTileRows} /> } : {})}
            footer={state.kind === 'ok' ? <EndOfList /> : null}
            renderTile={(item) => {
              const title = item.title ?? item.feedUrl;
              return (
                <Pressable onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(item.feedUrl) } })} accessibilityRole="button" accessibilityLabel={`Open ${title}`}>
                  <ArtTile url={item.imageUrl} name={title} width={col} height={ME_MOSAIC.row * PROFILE.showTileRows + ME_MOSAIC.gap} testID="show-tile">
                    <Type step="lede" className="text-text" style={PROFILE_TYPE.showTitle} numberOfLines={3}>{title}</Type>
                  </ArtTile>
                </Pressable>
              );
            }}
          />
        );
      }}
    </PushedPage>
  );
}
