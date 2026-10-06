// A like post: one person's like of an episode with their note, with comments, reactions and Report.
/**
 * M21 US7 (T084, FR-062). OUR OWN DESIGN (owner, 2026-10-06): 小宇宙 shows likes on a profile,
 * but this page — a like as a post people can comment on and react to — is ours. The server
 * (`GET /v1/likes/:owner/:episode`) answers 404 when the viewer may not see the like (private
 * likes, a block either way, a hidden show), and leaves out comments from anyone across a block.
 * Comments are ≤ 280 characters; one emoji reaction per listener, tapped again to take it back.
 * Report reports the person (the like) or a comment's author through the shared report sheet.
 */
import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Input, InputField } from '@/ui/lib/input';
import { hit } from '@/design';
import { PageHeader } from '@/ui/kit/PageHeader';
import { BarButton } from '@/ui/kit/TopBar';
import { Avatar } from '@/ui/kit/Avatar';
import { Card } from '@/ui/kit/Card';
import { Icon } from '@/ui/kit/Icon';
import { Loader } from '@/ui/kit/Loader';
import { Button } from '@/ui/kit/Button';
import { relativeTime } from '@/ui/kit/format';
import { useColours } from '@/ui/kit/useColours';
import { EmptyPicture } from '@/ui/me/parts';
import { EpisodeLine } from '@/ui/discover/parts';
import { ReportSheet, type ReportTarget } from '@/ui/comments/ReportSheet';
import { useStores, useToast } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { useCardActions } from '@/discover/useDiscover';
import { LIKE_COMMENT_MAX, useExploreApi, type LikePost } from '@/discover/explore-api';

const TAP = { minHeight: hit.min, minWidth: hit.min };
/** The reactions offered; any one per listener. Plain emoji — our own choice of five. */
const EMOJI = ['👍', '❤️', '😂', '🔥', '👏'] as const;

type State = { kind: 'loading' } | { kind: 'gone' } | { kind: 'error' } | { kind: 'ok'; post: LikePost };

export default function LikePostScreen(): React.ReactElement {
  const { owner, episode } = useLocalSearchParams<{ owner: string; episode: string }>();
  const api = useExploreApi();
  const { listener } = useSocial();
  const stores = useStores();
  const c = useColours(stores.settings);
  const toast = useToast();
  const { open, play } = useCardActions();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState<ReportTarget | undefined>();

  const load = useCallback(() => {
    if (!owner || !episode) return;
    api.likePost(owner, episode).then(
      (post) => setState({ kind: 'ok', post }),
      (e: { status?: number }) => setState(e.status === 404 ? { kind: 'gone' } : { kind: 'error' }),
    );
  }, [api, owner, episode]);
  useEffect(() => { load(); }, [load]);

  const needSignIn = (): boolean => { if (listener) return false; router.push('/auth/sign-in'); return true; };
  const send = (): void => {
    const body = draft.trim();
    if (!owner || !episode || body.length === 0 || needSignIn()) return;
    setBusy(true);
    api.commentOnLike(owner, episode, body).then(() => { setDraft(''); load(); }, () => toast("Couldn't send that — try again.")).finally(() => setBusy(false));
  };
  const react = (emoji: string, mine: string | undefined): void => {
    if (!owner || !episode || needSignIn()) return;
    const done = mine === emoji ? api.clearLikeReaction(owner, episode) : api.reactToLike(owner, episode, emoji);
    done.then(load, () => toast("Couldn't react — try again."));
  };
  const remove = (id: string): void => {
    if (!owner || !episode) return;
    api.deleteLikeComment(owner, episode, id).then(load, () => toast("Couldn't delete that — try again."));
  };

  if (state.kind !== 'ok') {
    return (
      <>
        <PageHeader title="Like" />
        <Box className="flex-1 bg-background">
          {state.kind === 'loading' ? <Loader className="my-section" /> : null}
          {state.kind === 'gone' ? <EmptyPicture icon="heart-dislike-outline" line="This like is not here any more, or is private" /> : null}
          {state.kind === 'error' ? (
            <Box className="items-center my-section">
              <Text className="text-muted text-sm">Couldn't load this right now.</Text>
              <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center" style={TAP}>
                <Text className="text-accent text-sm font-semibold">Retry</Text>
              </Pressable>
            </Box>
          ) : null}
        </Box>
      </>
    );
  }

  const { like, comments, reactions } = state.post;
  const who = like.listener;
  const now = new Date().toISOString();
  const isOwner = listener?.id === who?.id;
  const count = (emoji: string): number => reactions.counts.find((r) => r.emoji === emoji)?.n ?? 0;

  return (
    <>
      <PageHeader
        title={who ? `${who.displayName} liked` : 'Like'}
        right={who && !isOwner ? (
          <BarButton label={`Report ${who.displayName}`} onPress={() => setReporting({ kind: 'profile', id: who.id, authorId: who.id, label: 'profile' })}>
            <Icon name="flag-outline" size={20} color={c.text} />
          </BarButton>
        ) : undefined}
      />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-24" keyboardShouldPersistTaps="handled">
        <Card className="pt-row">
          {who ? (
            <Pressable onPress={() => router.push({ pathname: '/profile/[id]', params: { id: who.id } })} accessibilityRole="link" accessibilityLabel={`${who.displayName}, liked ${relativeTime(like.createdAt, now)}`} className="flex-row items-center gap-row" style={TAP}>
              <Avatar size={40} url={who.avatarUrl} name={who.displayName} />
              <Text className="flex-1 text-text text-body font-bold" numberOfLines={1}>{who.displayName}</Text>
              <Text className="text-muted text-xs">{relativeTime(like.createdAt, now)}</Text>
            </Pressable>
          ) : null}
          {like.note ? <Text className="text-text text-title font-display mt-gap">{`“${like.note}”`}</Text> : null}
          <EpisodeLine card={like.episode} size={56} onOpen={() => void open(like.episode)} onPlay={() => void play(like.episode)} />
        </Card>

        <Box className="flex-row flex-wrap gap-gap mt-row" accessibilityRole="toolbar" accessibilityLabel="Reactions">
          {EMOJI.map((e) => {
            const on = reactions.mine === e;
            const n = count(e);
            return (
              <Pressable key={e} onPress={() => react(e, reactions.mine)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${on ? 'Take back' : 'React with'} ${e}${n > 0 ? `, ${n}` : ''}`} className={`flex-row items-center gap-1 px-row rounded-pill border ${on ? 'bg-primary border-primary' : 'bg-surface border-border'}`} style={TAP}>
                <Text className={on ? 'text-onPrimary text-body' : 'text-text text-body'}>{e}</Text>
                {n > 0 ? <Text className={on ? 'text-onPrimary text-meta font-bold' : 'text-muted text-meta'}>{n}</Text> : null}
              </Pressable>
            );
          })}
        </Box>

        <Text className="text-text text-lg font-display mt-section mb-gap" accessibilityRole="header">{comments.length > 0 ? `Comments · ${comments.length}` : 'Comments'}</Text>
        {comments.length === 0 ? <Text className="text-muted text-meta">No comments yet. Say something kind.</Text> : null}
        {comments.map((m, k) => (
          <Box key={m.id} className={`flex-row gap-row py-row ${k > 0 ? 'border-t-hairline border-separator' : ''}`}>
            <Avatar size={32} url={m.author.avatarUrl} name={m.author.displayName} />
            <Box className="flex-1">
              <Text className="text-text text-meta font-bold">{`${m.author.displayName} · ${relativeTime(m.createdAt, now)}`}</Text>
              <Text className="text-text text-body mt-0.5">{m.body}</Text>
            </Box>
            {m.mine || isOwner ? (
              <Pressable onPress={() => remove(m.id)} accessibilityRole="button" accessibilityLabel={`Delete the comment by ${m.author.displayName}`} className="items-center justify-center" style={TAP}>
                <Icon name="trash-outline" size={18} color={c.muted} />
              </Pressable>
            ) : (
              <Pressable onPress={() => setReporting({ kind: 'profile', id: m.author.id, authorId: m.author.id, label: 'profile' })} accessibilityRole="button" accessibilityLabel={`Report ${m.author.displayName}`} className="items-center justify-center" style={TAP}>
                <Icon name="flag-outline" size={18} color={c.muted} />
              </Pressable>
            )}
          </Box>
        ))}

        <Box className="flex-row items-center gap-gap mt-section">
          <Input className="flex-1 bg-surface border border-border rounded-pill h-auto px-0">
            <InputField value={draft} onChangeText={setDraft} maxLength={LIKE_COMMENT_MAX} placeholder={listener ? 'Write a comment' : 'Sign in to comment'} placeholderTextColor={c.muted} accessibilityLabel="Write a comment on this like" className="px-section text-text text-body" style={TAP} />
          </Input>
          <Button label="Send" onPress={send} busy={busy} disabled={draft.trim().length === 0} />
        </Box>
        <Text className="text-muted text-xs mt-1 text-right">{`${draft.length} / ${LIKE_COMMENT_MAX}`}</Text>
      </ScrollView>
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
    </>
  );
}
