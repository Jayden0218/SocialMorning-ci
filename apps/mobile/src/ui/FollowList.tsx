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
 */
import { useCallback, useEffect, useState } from 'react';
import { FlatList } from './lib/flat-list';
import { Pressable } from './lib/pressable';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { Link } from '../design/tailwind';
import { hit } from '../design';
import { useSocial } from '../social/context';
import { useSafety } from '../safety/context';
import type { ClipAuthor } from '../social/api';
import { EmptyState } from './EmptyState';
import { Loader } from './Loader';
import { PageHeader } from './PageHeader';

const TAP = { minHeight: hit.min };

export type FollowKind = 'followers' | 'following';

/**
 * The empty list's sentence, naming whose list it is. Your own keeps the table's sentence
 * (with its action); anyone else's says their name.
 */
export function followEmptyLine(kind: FollowKind, own: boolean, name: string | undefined): string | undefined {
  if (own) return undefined; // EmptyState's own sentence, which is about you
  const named = name !== undefined && name.trim() !== '';
  if (kind === 'followers') return `Nobody follows ${named ? name : 'this listener'} yet.`;
  return `${named ? name : 'This listener'} doesn't follow anyone yet.`;
}

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; rows: ClipAuthor[]; next?: string };

export function FollowList(props: { kind: FollowKind; id: string; name?: string }): React.ReactElement {
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
  const more = () => {
    if (state.kind !== 'ok' || !state.next) return;
    const before = state.next;
    fetchPage(before).then((r) => setState((s) => (s.kind === 'ok' ? { kind: 'ok', rows: [...s.rows, ...r.listeners], ...(r.next ? { next: r.next } : {}) } : s)), () => undefined);
  };
  return (
    <>
      <PageHeader title={props.kind === 'followers' ? 'Followers' : 'Following'} />
      <FlatList
        className="flex-1 bg-background"
        data={state.kind === 'ok' ? safetyFilter.listeners(state.rows) : []}
        keyExtractor={(l) => l.id}
        contentContainerClassName="px-screen-x py-section flex-grow"
        ListEmptyComponent={state.kind === 'loading' ? <Loader className="my-section" /> : state.kind === 'error' ? (
          <Box className="items-center my-section">
            <Text className="text-muted text-sm">{`Couldn't load ${props.kind === 'followers' ? 'followers' : 'who this is following'} right now.`}</Text>
            <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center" style={TAP}><Text className="text-accent text-sm font-semibold">Retry</Text></Pressable>
          </Box>
        ) : emptyLine === undefined ? <EmptyState surface={props.kind} /> : <Text className="text-text text-[15px] py-4">{emptyLine}</Text>}
        renderItem={({ item }) => (
          <Link href={{ pathname: '/profile/[id]', params: { id: item.id } }} asChild>
            <Pressable className="py-3 border-b-hairline border-separator" accessibilityRole="link"><Text className="text-sm text-text">{item.displayName ?? 'Deleted account'}</Text></Pressable>
          </Link>
        )}
        onEndReached={more}
      />
    </>
  );
}
