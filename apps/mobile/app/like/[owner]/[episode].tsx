// A like post: one person's like of an episode with their note, with comments, reactions and Report.
/**
 * M21 US7 (T084, FR-062). OUR OWN DESIGN (owner, 2026-10-06): 小宇宙 shows likes on a profile,
 * but this page — a like as a post people can comment on and react to — is ours. The server
 * (`GET /v1/likes/:owner/:episode`) answers 404 when the viewer may not see the like (private
 * likes, a block either way, a hidden show), and leaves out comments from anyone across a block.
 * Comments are ≤ 280 characters; one emoji reaction per listener, tapped again to take it back.
 * Report reports the person (the like) or a comment's author through the shared report sheet.
 *
 * Spec 039 (Detail template): a `DetailList` (`PageList`): Back + "Like" in the title row; the header is who liked it and when, their note, the episode strip and the
 * reaction chips, then the "Comments · n" heading; the comments are raise cards, 12 apart; the composer is the list's `below` slot (over the keyboard's avoiding view). The cover
 * stage, the veil, the spine and the comments zone are gone.
 *
 * F3 (design-pulse2 `listen.html` `like--screen`, `like--gone`; layout pattern Stage + Thread): the liked episode's art is the
 * stage (330 tall, a veil to void), and on it, 150 from the top: who liked it and when (the avatar and name open their profile; the
 * flag reports them), their note in Unbounded 700 22, the episode strip (raise at 80 %, radius 16, cover 40, play 32) and the
 * reaction chips (34 tall; yours is light; tap again = "Take back"). Below, a spine and the comments as raise cards (avatar 24,
 * name, age in mono, the words, Report or Delete). The foot is the comments pages' zone: back, "Comments n" (Unbounded 800 24) and the
 * composer (56, radius 22) with the hot Send circle. Not found: the grey glow and today's words.
 *
 * Not as drawn: the "n / 280" counter under the old field is gone (the field stops at 280); a comment's Delete is a words link
 * like Report (it was a bin).
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/kit/Text';
import { Input, InputField } from '@/ui/lib/input';
import { colour, spacing, typeStyle } from '@/design';
import { likeStage } from '@/design/tokens';
import { Artwork } from '@/ui/kit/Artwork';
import { Avatar } from '@/ui/kit/Avatar';
import { Icon } from '@/ui/kit/Icon';
import { Loader } from '@/ui/kit/Loader';
import { IconButton } from '@/ui/kit/PulseButton';
import { DetailList, DetailPage } from '@/ui/detail/DetailPage';
import { Type } from '@/ui/kit/Type';
import { relativeTime } from '@/ui/kit/format';
import { KeyboardPage, PageEmpty, ageLabel, LIST, PlayDot } from '@/ui/me/lists';
import { ME_TYPE } from '@/ui/me/measures';
import { COMMENTS } from '@/ui/comments/measures';
import { ReportSheet, type ReportTarget } from '@/ui/comments/ReportSheet';
import { useToast } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { useCardActions } from '@/discover/useDiscover';
import { LIKE_COMMENT_MAX, useExploreApi, type LikePost } from '@/discover/explore-api';
import { nowMs as clockMs } from '@/ui/kit/clock';

/** The reactions offered; any one per listener. Plain emoji — our own choice of five. */
const EMOJI = ['👍', '❤️', '😂', '🔥', '👏'] as const;

/** Spec 039: the sizes inside the page; the stage (cover to the fold, veil, words at 150) and the 118 thread offset are gone. */
const LIKE = {
  gap: 10,
  avatar: 36,
  flag: 18,
  strip: { radius: 16, pad: 8, cover: 40, coverRadius: 10, play: 32 },
  chip: 34,
  card: { avatar: 24, gap: 8 },
  field: 56,
  send: 36,
} as const;

type State = { kind: 'loading' } | { kind: 'gone' } | { kind: 'error' } | { kind: 'ok'; post: LikePost };

export default function LikePostScreen(): React.ReactElement {
  const { owner, episode } = useLocalSearchParams<{ owner: string; episode: string }>();
  const api = useExploreApi();
  const { listener } = useSocial();
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
      <DetailPage title="Like">
        {state.kind === 'loading' ? <Box className="items-center"><Loader /></Box> : null}
        {state.kind === 'gone' ? <PageEmpty top={0} title="Not here" line="This like is not here any more, or is private" /> : null}
        {state.kind === 'error' ? <PageEmpty top={0} title="Couldn't load" line="Couldn't load this right now." action={{ label: 'Retry', onPress: load }} /> : null}
      </DetailPage>
    );
  }

  const { like, comments, reactions } = state.post;
  const who = like.listener;
  const nowMs = clockMs();
  const now = new Date(nowMs).toISOString();
  const age = ageLabel(Date.parse(like.createdAt), nowMs);
  /** Drawn "liked 2h ago"; the spoken name of the link keeps the app's own "2 h ago". */
  const likedAgo = age === 'now' ? 'liked just now' : `liked ${age} ago`;
  const isOwner = listener?.listenerId === who?.id;
  const count = (emoji: string): number => reactions.counts.find((r) => r.emoji === emoji)?.n ?? 0;
  const art = like.episode.imageUrl;

  return (
    <KeyboardPage>
      <DetailList<(typeof comments)[number]>
        title="Like"
        gap={spacing.row}
        keyboardShouldPersistTaps="handled"
        header={
          <Box testID="like-stage" style={{ gap: LIKE.gap }}>
                    <Box className="flex-row items-center" style={{ gap: LIKE.gap }}>
                      {who ? (
                        <Pressable onPress={() => router.push({ pathname: '/profile/[id]', params: { id: who.id } })} accessibilityRole="link" accessibilityLabel={`${who.displayName}, liked ${relativeTime(like.createdAt, now)}`} className="flex-1 flex-row items-center" style={{ gap: LIKE.gap, minHeight: LIKE.avatar + 12 }}>
                          <Avatar size={LIKE.avatar} url={who.avatarUrl} name={who.displayName} />
                          <Box className="flex-1">
                            <Type step="row" className="text-text" style={ME_TYPE.name14} numberOfLines={1}>{who.displayName}</Type>
                            <Type step="caption" className="text-text2" style={[ME_TYPE.node12, { marginTop: spacing.hair }]} numberOfLines={1}>{likedAgo}</Type>
                          </Box>
                        </Pressable>
                      ) : <Box className="flex-1" />}
                      {who && !isOwner ? (
                        <IconButton icon="flag-outline" label={`Report ${who.displayName}`} onPress={() => setReporting({ kind: 'profile', id: who.id, authorId: who.id, label: 'profile' })} size={LIKE.flag} tone="text2" />
                      ) : null}
                    </Box>
                    {like.note ? <Type step="lede" className="text-text font-bold" style={ME_TYPE.stage22}>{`“${like.note}”`}</Type> : null}
                    <Box testID="like-strip" className="flex-row items-center" style={{ gap: LIKE.gap, backgroundColor: likeStage.stripFill, borderRadius: LIKE.strip.radius, padding: LIKE.strip.pad }}>
                      <Pressable onPress={() => void open(like.episode)} accessibilityRole="button" accessibilityLabel={`Open ${like.episode.title}`} className="flex-1 flex-row items-center" style={{ gap: LIKE.gap, minHeight: LIKE.strip.cover }}>
                        <Box style={{ width: LIKE.strip.cover, height: LIKE.strip.cover, borderRadius: LIKE.strip.coverRadius, overflow: 'hidden' }}>
                          <Artwork url={art ?? null} size={LIKE.strip.cover} name={like.episode.showTitle} />
                        </Box>
                        <Type step="caption" className="text-text font-semibold flex-1" numberOfLines={2}>{like.episode.title}</Type>
                      </Pressable>
                      <Pressable onPress={() => void play(like.episode)} accessibilityRole="button" accessibilityLabel={`Play ${like.episode.title}`} hitSlop={spacing.gap} className="items-center justify-center">
                        <PlayDot size={LIKE.strip.play} />
                      </Pressable>
                    </Box>
                    <Box className="flex-row flex-wrap" style={{ gap: spacing.gap }} accessibilityRole="toolbar" accessibilityLabel="Reactions">
                      {EMOJI.map((e) => {
                        const on = reactions.mine === e;
                        const n = count(e);
                        return (
                          <Pressable
                            key={e}
                            onPress={() => react(e, reactions.mine)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                            accessibilityLabel={`${on ? 'Take back' : 'React with'} ${e}${n > 0 ? `, ${n}` : ''}`}
                            hitSlop={{ top: 7, bottom: 7 }}
                            className={`flex-row items-center justify-center rounded-pill border ${on ? 'bg-text border-text' : 'bg-raise border-line'}`}
                            style={{ height: LIKE.chip, paddingHorizontal: spacing.row + 2, gap: 6 }}
                          >
                            <Text className={on ? 'text-void' : 'text-text'} style={typeStyle('chip')}>{e}</Text>
                            {n > 0 ? <Text className={on ? 'text-void' : 'text-text'} style={typeStyle('chip')}>{String(n)}</Text> : null}
                          </Pressable>
                        );
                      })}
                    </Box>
            <Type step="heading" accessibilityRole="header" className="text-text">{`Comments · ${comments.length}`}</Type>
          </Box>
        }
        data={comments}
        keyExtractor={(m) => m.id}
        ListEmptyComponent={<Type step="note" className="text-text2">No comments yet. Say something kind.</Type>}
        renderItem={({ item: m }) => (
                      <Box key={m.id} testID="like-comment" className="bg-raise" style={{ borderRadius: LIST.cardRadius, padding: LIST.cardPad, gap: spacing.gap }}>
                        <Box className="flex-row items-center" style={{ gap: LIKE.card.gap }}>
                          <Avatar size={LIKE.card.avatar} url={m.author.avatarUrl} name={m.author.displayName} />
                          <Type step="row" className="text-text" style={ME_TYPE.name14} numberOfLines={1}>{m.author.displayName}</Type>
                          <Type step="mono" className="text-text3" style={ME_TYPE.mono11}>{ageLabel(Date.parse(m.createdAt), nowMs)}</Type>
                        </Box>
                        <Type step="body" className="text-text">{m.body}</Type>
                        <Box className="flex-row">
                          {m.mine || isOwner ? (
                            <Pressable onPress={() => remove(m.id)} accessibilityRole="button" accessibilityLabel={`Delete the comment by ${m.author.displayName}`} hitSlop={spacing.gap + 2} className="justify-center" style={{ minHeight: spacing.block }}>
                              <Type step="caption" className="text-text2 font-medium" style={ME_TYPE.node12}>Delete</Type>
                            </Pressable>
                          ) : (
                            <Pressable onPress={() => setReporting({ kind: 'profile', id: m.author.id, authorId: m.author.id, label: 'profile' })} accessibilityRole="button" accessibilityLabel={`Report ${m.author.displayName}`} hitSlop={spacing.gap + 2} className="justify-center" style={{ minHeight: spacing.block }}>
                              <Type step="caption" className="text-text2 font-medium" style={ME_TYPE.node12}>Report</Type>
                            </Pressable>
                          )}
                        </Box>
                      </Box>
        )}
        below={
                <Box testID="like-composer" className="flex-row items-center bg-raise2 border-line" style={{ height: LIKE.field, borderRadius: COMMENTS.composerRadius, paddingLeft: spacing.section, paddingRight: spacing.hair + 2, borderWidth: StyleSheet.hairlineWidth * 3, gap: 6 }}>
                  <Input className="flex-1 h-auto border-0 bg-clear" style={{ paddingHorizontal: 0 }}>
                    <InputField value={draft} onChangeText={setDraft} maxLength={LIKE_COMMENT_MAX} placeholder={listener ? 'Write a comment' : 'Sign in to comment'} placeholderTextColor={colour.text3} accessibilityLabel="Write a comment on this like" className="text-text" style={[ME_TYPE.field15, { height: LIKE.field }]} />
                  </Input>
                  <Pressable onPress={send} disabled={busy || draft.trim().length === 0} accessibilityRole="button" accessibilityLabel="Send" accessibilityState={{ disabled: busy || draft.trim().length === 0 }} hitSlop={spacing.hair + 2} className="bg-hot items-center justify-center" style={{ width: LIKE.send, height: LIKE.send, borderRadius: LIKE.send / 2 }}>
                    <Icon name="send" size={18} color={colour.void} />
                  </Pressable>
                </Box>
        }
        belowHeight={LIKE.field}
      />
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
    </KeyboardPage>
  );
}
