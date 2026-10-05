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
 * M17 (`Followers-B`, `FollowingList-B`): an eyebrow ("312 people", from the count the profile
 * showed; the owner's name when the page was opened without one) over the serif page title,
 * then a two-column grid of white cards — a round monogram and the name. Same rows, same links,
 * same paging, Retry and empty sentences.
 */
import { useCallback, useEffect, useState } from 'react';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Link } from '@/design/tailwind';
import { hit } from '@/design';
import { useSocial } from '@/social/context';
import { useSafety } from '@/safety/context';
import type { ClipAuthor } from '@/social/api';
import { EmptyState } from '@/ui/kit/EmptyState';
import { Loader } from '@/ui/kit/Loader';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { Artwork } from '@/ui/kit/Artwork';
import { EndOfList } from '@/ui/kit/EndOfList';

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

/** The empty partner of an odd last card in the grid; never tappable, never spoken. */
const FILLER: ClipAuthor = { id: '__filler', displayName: null };

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; rows: ClipAuthor[]; next?: string };

/** The eyebrow over the title: the count when the profile passed one, else whose list it is. */
export function followEyebrow(count: number | undefined, name: string | undefined): string | undefined {
  if (count !== undefined && Number.isFinite(count) && count >= 0) return count === 1 ? '1 person' : `${count} people`;
  return name !== undefined && name.trim() !== '' ? name : undefined;
}

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
  const eyebrow = followEyebrow(props.count, props.name);
  // Two columns: an odd last card gets an empty partner so it keeps a half width.
  const shown = state.kind === 'ok' ? safetyFilter.listeners(state.rows) : [];
  const rows: ClipAuthor[] = shown.length % 2 === 1 ? [...shown, FILLER] : shown;
  const more = () => {
    if (state.kind !== 'ok' || !state.next) return;
    const before = state.next;
    fetchPage(before).then((r) => setState((s) => (s.kind === 'ok' ? { kind: 'ok', rows: [...s.rows, ...r.listeners], ...(r.next ? { next: r.next } : {}) } : s)), () => undefined);
  };
  return (
    <>
      {/* M17: the bar keeps only the back button; the eyebrow sits above the title, which
          PageHeader's subtitle (under the title) cannot do. */}
      <PageHeader middle={<Box className="flex-1" />} />
      <Box className="bg-background px-screen-x pb-row">
        {eyebrow !== undefined ? <Eyebrow accent>{eyebrow}</Eyebrow> : null}
        <Text className="text-text text-display font-display" accessibilityRole="header">{props.kind === 'followers' ? 'Followers' : 'Following'}</Text>
      </Box>
      <FlatList
        className="flex-1 bg-background"
        data={rows}
        // Owner, 2026-10-05: the bottom of a fetched list says so.
        ListFooterComponent={state.kind === 'ok' && state.rows.length > 0 && !state.next ? <EndOfList /> : null}
        keyExtractor={(l) => l.id}
        numColumns={2}
        columnWrapperClassName="gap-row"
        contentContainerClassName="px-screen-x pb-section gap-row flex-grow"
        ListEmptyComponent={state.kind === 'loading' ? <Loader className="my-section" /> : state.kind === 'error' ? (
          <Box className="items-center my-section">
            <Text className="text-muted text-sm">{`Couldn't load ${props.kind === 'followers' ? 'followers' : 'who this is following'} right now.`}</Text>
            <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center" style={TAP}><Text className="text-accent text-sm font-semibold">Retry</Text></Pressable>
          </Box>
        ) : emptyLine === undefined ? <EmptyState surface={props.kind} /> : <Text className="text-text text-[15px] py-4">{emptyLine}</Text>}
        renderItem={({ item }) => item === FILLER ? <Box className="flex-1" accessible={false} /> : (
          <Link href={{ pathname: '/profile/[id]', params: { id: item.id } }} asChild>
            <Pressable className="flex-1 items-center gap-gap bg-surface border border-border rounded-row py-section px-gap" accessibilityRole="link">
              <Artwork size={56} rounded="pill" {...(item.displayName ? { name: item.displayName } : {})} />
              <Text className={item.displayName ? 'text-body font-bold text-text text-center' : 'text-body italic text-muted text-center'} numberOfLines={1}>{item.displayName ?? 'Deleted account'}</Text>
            </Pressable>
          </Link>
        )}
        onEndReached={more}
      />
    </>
  );
}
