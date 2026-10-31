// Page-by-page list of a person's followers or who they follow.
/**
 * A paged list of followers or following (M4 FR-007) — one component for both pages.
 *
 * M16a bug 2 (FR-003, FR-004). Phone walk 2026-10-02: own profile said 300 followers, the list
 * said "Nobody follows you yet", and another user's empty list said "you" too. Causes read from
 * the code:
 *  - The empty text came from one fixed sentence (social-core `empty.ts`, "Nobody follows you
 *    yet") whoever the profile belonged to. It now names the owner: "you" only on your own.
 *  - The page swallowed every failed request (`.catch(() => undefined)`) and drew the empty
 *    sentence, so a list that did not load looked like a list with nobody in it. It now shows
 *    loading, then the rows, an error with Retry, or — only for a real empty answer — the
 *    empty sentence.
 *  - The server counted every follow row, while the list leaves out listeners the viewer blocked;
 *    `counts` now uses the list's rule (apps/api/src/db/repos/follows.ts).
 *
 * M21 US8 (FR-074): each card adds the person's one-line bio and, when you are signed in, a
 * Follow / Following button (`youFollow` from the server; never on your own card).
 *
 * M31 W4-A (T050; design-pulse2 social.html `profile-followers--screen`, `--own-empty`, `--other-empty`, `--load-failed`,
 * `profile-following--screen`, `--own-empty`; layout pattern Mosaic): people are 1 x 1 tiles (rows 84, 10 apart, radius 22, in
 * the Me tab's lane), each an avatar 40 and the name 14/600 over a bio line 11 in text3; a deleted account reads "Deleted account"
 * in italics and is not a link. The edge label is "People". The title is the page's (30), the subtitle "Rui Costa · 1.2k"
 * (the name, then the count the profile passed; "You" on your own empty list). Loading is ghost tiles; the end says "That's all";
 * a failed load is an inline tile at the top of the mosaic, "Couldn't load followers right now." with a light Retry; an empty
 * list is the centred empty block ("Nobody yet" and the sentence; your own with a light Open Discover).
 *
 * Not as drawn: the tile has no Follow button in the drawing; the M21 Follow stays, a 32 tall pill under the bio, so a tile that
 * carries one is 108 tall rather than 84 (the action inventory's rule: every action stays).
 */
import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Link } from '@/design/tailwind';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { spacing } from '@/design';
import { EMPTY_STATES } from '@socialmorning/social-core';
import { useSocial } from '@/social/context';
import { useSafety } from '@/safety/context';
import type { ClipAuthor } from '@/social/api';
import { Avatar } from '@/ui/kit/Avatar';
import { EndOfList } from '@/ui/kit/EndOfList';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { DRAWN, PageEmpty, emptyTop } from '@/ui/me/lists';
import { ErrorTile, GhostTiles, MosaicList, NameText } from '@/ui/profile/parts';
import { PROFILE, PROFILE_TYPE } from '@/ui/profile/measures';
import { FollowButton } from './FollowButton';

export type FollowKind = 'followers' | 'following';

/**
 * The empty list's sentence, naming whose list it is. Your own keeps the table's sentence
 * (with its action); anyone else's says their name.
 */
export function followEmptyLine(kind: FollowKind, own: boolean, name: string | undefined): string | undefined {
  if (own) return undefined; // the table's own sentence, which is about you
  const named = name !== undefined && name.trim() !== '';
  if (kind === 'followers') return `Nobody follows ${named ? name : 'this listener'} yet.`;
  return `${named ? name : 'This listener'} doesn't follow anyone yet.`;
}

/** "1.2k", "8.4M": the count as the drawing writes it. */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const [value, unit] = n < 1_000_000 ? [n / 1000, 'k'] : [n / 1_000_000, 'M'];
  return `${value >= 100 ? Math.round(value) : (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '')}${unit}`;
}

/** The subtitle under the title: "Rui Costa · 1.2k" (the name, then the count the profile passed). */
export function followSubtitle(count: number | undefined, name: string | undefined): string | undefined {
  const n = count !== undefined && Number.isFinite(count) && count >= 0 ? compactCount(count) : undefined;
  const who = name !== undefined && name.trim() !== '' ? name : undefined;
  if (who !== undefined && n !== undefined) return `${who} · ${n}`;
  return who ?? n;
}

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; rows: ClipAuthor[]; next?: string };

export function FollowList(props: { kind: FollowKind; id: string; name?: string; count?: number }): React.ReactElement {
  const { api, listener } = useSocial();
  const safetyFilter = useSafety();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const fetchPage = useCallback((before?: string) => (props.kind === 'followers' ? api.followers(props.id, before) : api.following(props.id, before)), [api, props.kind, props.id]);
  const load = useCallback(() => {
    setState({ kind: 'loading' });
    fetchPage().then((r) => setState({ kind: 'ok', rows: r.listeners, ...(r.next ? { next: r.next } : {}) }), () => setState({ kind: 'error' }));
  }, [fetchPage]);
  useEffect(() => { load(); }, [load]);
  const own = listener?.listenerId === props.id;
  const emptyLine = followEmptyLine(props.kind, own, props.name);
  const shown = state.kind === 'ok' ? safetyFilter.listeners(state.rows) : [];
  const more = () => {
    if (state.kind !== 'ok' || !state.next) return;
    const before = state.next;
    fetchPage(before).then((r) => setState((s) => (s.kind === 'ok' ? { kind: 'ok', rows: [...s.rows, ...r.listeners], ...(r.next ? { next: r.next } : {}) } : s)), () => undefined);
  };
  const title = props.kind === 'followers' ? 'Followers' : 'Following';
  const nothing = state.kind === 'ok' && shown.length === 0;
  const subtitle = nothing && own ? 'You' : followSubtitle(props.count, props.name);
  const failure = `Couldn't load ${props.kind === 'followers' ? 'followers' : 'who this is following'} right now.`;
  return (
    <PushedPage title={title} {...(subtitle ? { subtitle } : {})}>
      {(layout) => {
        const lane = layout.top + (DRAWN.listTop - DRAWN.status);
        if (nothing) {
          return (
            <Box className="flex-1" style={{ paddingTop: lane }}>
              {emptyLine === undefined ? (
                <PageEmpty top={emptyTop(230)} title="Nobody yet" line={EMPTY_STATES[props.kind].sentence} action={{ label: EMPTY_STATES[props.kind].action.label, onPress: () => router.push(EMPTY_STATES[props.kind].action.route as never) }} />
              ) : (
                <PageEmpty top={emptyTop(240)} title="Nobody yet" line={emptyLine} />
              )}
            </Box>
          );
        }
        return (
          <MosaicList
            data={shown}
            keyOf={(l) => l.id}
            top={layout.top}
            reserve={layout.reserve}
            labels={state.kind === 'ok' ? [{ text: 'People', top: PROFILE.labelTop }] : []}
            {...(state.kind === 'loading' ? { header: <GhostTiles count={8} /> } : {})}
            footer={state.kind === 'ok' && state.rows.length > 0 && !state.next ? <EndOfList /> : null}
            empty={state.kind === 'error' ? <ErrorTile line={failure}><PulseButton label="Retry" kind="light" onPress={load} className="self-start" /></ErrorTile> : null}
            onEnd={more}
            renderTile={(item) => <PersonTile person={item} youId={listener?.listenerId} />}
          />
        );
      }}
    </PushedPage>
  );
}

/** One person: avatar 40, name 14/600, bio 11; a Follow pill under them when you are signed in and it is not you. A deleted account is not tappable. */
function PersonTile(props: { person: ClipAuthor; youId: string | undefined }): React.ReactElement {
  const item = props.person;
  const deleted = !item.displayName;
  const canFollow = props.youId !== undefined && item.youFollow !== undefined && item.id !== props.youId;
  return (
    <Box testID="person-tile" className="bg-raise justify-center" style={{ minHeight: ME_MOSAIC.row, padding: ME_MOSAIC.pad, borderRadius: ME_MOSAIC.radius, gap: spacing.gap }}>
      <Link href={{ pathname: '/profile/[id]', params: { id: item.id } }} asChild>
        <Pressable disabled={deleted} accessibilityRole={deleted ? 'text' : 'link'} className="flex-row items-center" style={{ gap: PROFILE.avatarGap }}>
          <Avatar size={PROFILE.avatar} url={item.avatarUrl} name={item.displayName} />
          <Box className="flex-1 min-w-0">
            <NameText step="compact" muted={deleted} numberOfLines={1}>{item.displayName ?? 'Deleted account'}</NameText>
            {item.bio ? <Type step="caption" className="text-text3" style={PROFILE_TYPE.bio11} numberOfLines={1}>{item.bio}</Type> : null}
          </Box>
        </Pressable>
      </Link>
      {canFollow ? <FollowButton compact listenerId={item.id} following={item.youFollow === true} /> : null}
    </Box>
  );
}
