// One conversation: messages oldest to newest, new ones every 5 seconds, write and send.
/**
 * A conversation (owner, 2026-10-04) at `/chat/<listenerId>`. The bar shows the person's name
 * (tap → their profile). Messages arrive by polling `after` the newest id every 5 s while the
 * page is open. The box at the bottom sends text (≤ 1000 characters); a page opened from
 * Share → "Send in chat" carries `episodeId` and shows that episode above the box until it is
 * sent or removed; a show's Share carries `text`, which starts in the box (owner, 2026-10-05). When the two of you no longer follow each other, the box is replaced by a
 * line that says why — the history stays.
 *
 * M24 US1: a long-press on a message from the other person offers Report; a reported message is
 * hidden for me at once (and sent to Admin, which can remove it for both of us).
 *
 * M31 W4-C (T052; design-pulse2 `social.html#chat-thread--screen`, `--signed-out`, `--cannot-send`, `--error`, `--toast`; layout
 * pattern Thread): the messages hang from the spine at x 40, 10 under the status bar, in nodes — a raise tick ("Mon", "9:12") marks
 * each gap over 10 minutes (`nodes.ts`); theirs are raise bubbles, yours hot with void words (`MessageBubble`). The thumb zone has
 * the back circle, their avatar (36) and name (Unbounded 22) with "open profile ›" — the whole group opens the profile — then the
 * box (min 52, grows to 5 lines) and the hot Send circle (52, half-faded until there is something to send). Over 1000 characters
 * a hot "1012 / 1000" count sits above it. When you cannot send, a dashed 56 note replaces the box; signed out, a lock block with a
 * light Sign in; a failed load, the wifi block (the name row stays, so the profile is one tap away); no messages, "Say hello to Ana."
 *
 * Not as drawn: the toast sits where the pushed-page toast sits (the drawing lifts it to 176 over the composer; the toast placement
 * in the shell has no entry for this page yet).
 */
import { reportAndDrop } from '@/telemetry/reportError';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { RNFlatList } from '@/ui/lib/flat-list';
import { KeyboardAvoidingView } from '@/ui/lib/keyboard-avoiding-view';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { colour, gutter } from '@/design';
import { Avatar } from '@/ui/kit/Avatar';
import { Fade } from '@/ui/kit/Fade';
import { Icon } from '@/ui/kit/Icon';
import { Loader } from '@/ui/kit/Loader';
import { goBack } from '@/ui/kit/PageHeader';
import { IconButton, PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { useStores, useToast } from '@/ui/shell/providers';
import { MessageBubble } from '@/ui/chat/MessageBubble';
import { CenterAt, ErrBlock, SignInBlock } from '@/ui/chat/blocks';
import { CHAT } from '@/ui/chat/measures';
import { chatNodes, type ChatNode } from '@/ui/chat/nodes';
import { BottomZone } from '@/ui/comments/CommentsBottom';
import { COMMENTS, ZONE_BOTTOM, belowStatus } from '@/ui/comments/measures';
import { Tick } from '@/ui/comments/Spine';
import { useInsets } from '@/ui/comments/useInsets';
import { ThreadNode, ThreadSpine } from '@/ui/me/lists';
import { useCardActions } from '@/discover/useDiscover';
import { ApiError } from '@/social/api';
import { useSocial } from '@/social/context';
import { registrationFor } from '@/social/registration';
import { MoreSheet } from '@/ui/social/MoreSheet';
import { ReportSheet, type ReportTarget } from '@/ui/comments/ReportSheet';
import { useSafety } from '@/safety/context';
import { CHAT_BODY_MAX, CHAT_POLL_MS, mergeMessages, newestId, useChatApi, type ChatMessage, type ChatPerson } from '@/social/chat-api';
import { nowMs as clockMs } from '@/ui/kit/clock';

export default function ChatThread(): React.ReactElement {
  const params = useLocalSearchParams<{ id: string; name?: string; episodeId?: string; episodeTitle?: string; text?: string }>();
  const otherId = String(params.id);
  const stores = useStores();
  const toast = useToast();
  const { api, listener } = useSocial();
  const chat = useChatApi();
  const { open, play } = useCardActions();
  const insets = useInsets();
  const { width } = useWindowDimensions();
  const list = useRef<RNFlatList<ChatNode>>(null);
  const { safety } = useSafety();
  const [more, setMore] = useState<ChatMessage | undefined>(undefined);
  const [reporting, setReporting] = useState<ReportTarget | undefined>(undefined);

  const [who, setWho] = useState<ChatPerson | undefined>(params.name ? { id: otherId, displayName: String(params.name) } : undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [canSend, setCanSend] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [draft, setDraft] = useState(params.text ? String(params.text) : '');
  const [attach, setAttach] = useState<{ id: string; title: string } | undefined>(
    params.episodeId ? { id: String(params.episodeId), title: String(params.episodeTitle ?? 'Episode') } : undefined,
  );
  const [sending, setSending] = useState(false);
  const [zone, setZone] = useState(0);
  // The poll reads the newest id through a ref so the timer never restarts on every message.
  const latest = useRef<string | undefined>(undefined);

  useFocusEffect(useCallback(() => {
    if (!listener) return undefined;
    let live = true;
    const read = async () => {
      try {
        const t = await chat.thread(otherId, latest.current);
        if (!live) return;
        setWho(t.with);
        setCanSend(t.canSend);
        setError(undefined);
        setMessages((known) => {
          const next = mergeMessages(known, t.messages);
          latest.current = newestId(next);
          return next;
        });
      } catch (e) {
        if (live && latest.current === undefined) setError(e instanceof ApiError && e.code !== 'network' ? e.message : "Couldn't reach the server.");
      } finally {
        if (live) setLoaded(true);
      }
    };
    void read();
    const timer = setInterval(() => void read(), CHAT_POLL_MS);
    return () => { live = false; clearInterval(timer); };
  }, [chat, otherId, listener]));

  const body = draft.trim();
  const over = body.length > CHAT_BODY_MAX;
  const cannot = sending || over || (body === '' && attach === undefined);

  const submit = async () => {
    if (cannot) return;
    setSending(true);
    try {
      if (attach) {
        // The server must know the episode before a message can carry it; the phone describes it.
        const reg = registrationFor(stores, attach.id);
        if (reg) await api.registerEpisode(attach.id, reg).catch(reportAndDrop('episode.register'));
      }
      const sent = await chat.send(otherId, { ...(body !== '' ? { body } : {}), ...(attach ? { episodeId: attach.id } : {}) });
      setMessages((known) => {
        const next = mergeMessages(known, [sent]);
        latest.current = newestId(next);
        return next;
      });
      setDraft('');
      setAttach(undefined);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'forbidden') setCanSend(false);
      toast(e instanceof ApiError && e.code !== 'network' ? e.message : "Couldn't send — check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  // F3: opened without a name (a link, or signed out, or the thread failed to load) the bar still names the person: their public profile
  // (`GET /v1/listeners/:id`, no sign-in needed) gives the name; "Chat" stays only until it arrives or when it cannot.
  const needsName = who === undefined;
  useEffect(() => {
    if (!needsName) return undefined;
    let live = true;
    api.profile(otherId).then((p) => { if (live) setWho((w) => w ?? { id: otherId, displayName: p.displayName }); }).catch(() => undefined);
    return () => { live = false; };
  }, [api, otherId, needsName]);
  const name = who?.displayName ?? 'Chat';
  // "Read" goes under my newest message only.
  const lastMine = [...messages].reverse().find((m) => m.fromMe)?.id;
  // M24 US1: what I reported stays hidden for me.
  const shown = useMemo(() => messages.filter((m) => m.fromMe || !safety.isHidden('chat_message', m.id)), [messages, safety]);
  const nodes = useMemo(() => chatNodes(shown, new Date(clockMs())), [shown]);
  const listTop = belowStatus(insets.top, CHAT.spineTop);

  const header = (
    <Box className="flex-row items-center" style={{ gap: CHAT.headerGap, paddingHorizontal: CHAT.headerPadX }} testID="chat-header">
      <IconButton icon="chevron-back" label="Back" onPress={goBack} fill />
      <Pressable
        onPress={() => router.push({ pathname: '/profile/[id]', params: { id: otherId } })}
        accessibilityRole="link"
        accessibilityLabel={`${name}, open profile`}
        className="flex-1 flex-row items-center"
        style={{ gap: CHAT.headerGap }}
      >
        <Avatar size={CHAT.headerAvatar} url={who?.avatarUrl} name={name} />
        <Box className="flex-1 min-w-0">
          <Type step="title" className="text-text font-extrabold" numberOfLines={1}>{name}</Type>
          <Type step="tag" className="text-text3" numberOfLines={1}>open profile ›</Type>
        </Box>
      </Pressable>
    </Box>
  );

  const zoneOf = (composer: React.ReactNode) => (
    <BottomZone bottom={ZONE_BOTTOM}>
      <Box style={{ gap: COMMENTS.zoneGap }} onLayout={(e) => setZone(e.nativeEvent.layout.height + ZONE_BOTTOM)}>
        {header}
        {composer}
      </Box>
    </BottomZone>
  );

  if (!listener) {
    return (
      <Box className="flex-1 bg-void">
        <CenterAt top={260}>
          <SignInBlock line="Sign in to chat.">
            <PulseButton label="Sign in" accessibilityLabel="Sign in" onPress={() => router.push('/auth/sign-in')} full />
          </SignInBlock>
        </CenterAt>
        <Fade bottom={0} height={300} />
        {zoneOf(null)}
      </Box>
    );
  }

  const composer = canSend ? (
    <Box style={{ gap: CHAT.composerGap }} testID="chat-composer">
      {attach ? (
        <Box className="flex-row items-center bg-raise2 border border-line" style={{ gap: CHAT.headerGap, borderRadius: CHAT.chipRadius, paddingLeft: CHAT.chipPadX }} testID="chat-attach">
          <Icon name="headset-outline" size={18} color={colour.hotText} />
          <Type step="caption" className="text-text flex-1" numberOfLines={1}>{attach.title}</Type>
          <Pressable onPress={() => setAttach(undefined)} accessibilityRole="button" accessibilityLabel="Remove the episode" className="items-center justify-center" style={{ width: CHAT.send - 4, height: CHAT.send - 4 }}>
            <Icon name="close" size={18} color={colour.text2} />
          </Pressable>
        </Box>
      ) : null}
      {over ? <Type step="tag" className="text-hotText text-right">{`${body.length} / ${CHAT_BODY_MAX}`}</Type> : null}
      <Box className="flex-row items-end" style={{ gap: CHAT.composerGap }}>
        <Textarea className="flex-1 h-auto bg-raise2 border border-line" style={{ minHeight: CHAT.boxMin, maxHeight: CHAT.boxMax, borderRadius: CHAT.boxRadius, paddingHorizontal: CHAT.boxPadX }}>
          <TextareaInput
            placeholderTextColor={colour.text3}
            className="text-text text-pulse-row font-medium"
            style={{ paddingVertical: 14 }}
            multiline
            placeholder={attach ? 'Add a message (optional)' : 'Message'}
            value={draft}
            onChangeText={setDraft}
            accessibilityLabel="Message"
          />
        </Textarea>
        <Pressable
          onPress={() => void submit()}
          disabled={cannot}
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: cannot, busy: sending }}
          className={`bg-hot items-center justify-center ${cannot ? 'opacity-50' : ''}`}
          style={{ width: CHAT.send, height: CHAT.send, borderRadius: CHAT.send / 2 }}
        >
          <Icon name="send" size={20} color={colour.void} />
        </Pressable>
      </Box>
    </Box>
  ) : (
    <Box className="flex-row items-center border border-dashed border-line" style={{ minHeight: CHAT.noteMin, borderRadius: CHAT.boxRadius, paddingVertical: CHAT.notePadY, paddingHorizontal: CHAT.notePadX, gap: CHAT.headerGap }} testID="chat-cannot-send">
      <Icon name="people-outline" size={CHAT.noteIcon} color={colour.text2} />
      <Type step="note" className="text-text2 flex-1">You can send messages while you both follow each other.</Type>
    </Box>
  );

  return (
    <KeyboardAvoidingView className="flex-1 bg-void" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {nodes.length > 0 ? (
        <>
          <ThreadSpine top={listTop} />
          <Box className="absolute left-0 right-0 bottom-0" style={{ top: listTop }} testID="chat-thread">
            <RNFlatList
              ref={list}
              className="flex-1"
              data={nodes}
              keyExtractor={(n) => n.key}
              contentContainerStyle={{ paddingTop: COMMENTS.listTop, paddingLeft: COMMENTS.listLeft, paddingRight: gutter(width), paddingBottom: zone + COMMENTS.nodeGap }}
              ItemSeparatorComponent={() => <Box style={{ height: COMMENTS.nodeGap }} />}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
              renderItem={({ item: node }) => (
                <ThreadNode lead={<Tick text={node.tick} />}>
                  <Box style={{ gap: CHAT.bubbleGap }}>
                    {node.messages.map((item) => (item.fromMe
                      ? <MessageBubble key={item.id} message={item} showRead={item.id === lastMine} onOpenEpisode={(e) => void open(e)} onPlayEpisode={(e) => void play(e)} />
                      : (
                        <Pressable key={item.id} onLongPress={() => setMore(item)} delayLongPress={350} accessibilityLabel={`Message from ${name}: ${item.body || 'an episode'}`} accessibilityHint="Long-press for Report" accessibilityActions={[{ name: 'longpress', label: 'Report' }]} onAccessibilityAction={() => setMore(item)}>
                          <MessageBubble message={item} showRead={false} onOpenEpisode={(e) => void open(e)} onPlayEpisode={(e) => void play(e)} />
                        </Pressable>
                      ))
                    )}
                  </Box>
                </ThreadNode>
              )}
            />
          </Box>
        </>
      ) : !loaded ? (
        <CenterAt top={280}><Loader /></CenterAt>
      ) : error ? (
        <CenterAt top={280}><ErrBlock line={error} /></CenterAt>
      ) : (
        <CenterAt top={280}><Type step="lede" className="text-text text-center">{`Say hello to ${name}.`}</Type></CenterAt>
      )}
      <Fade bottom={0} height={300} />
      {zoneOf(error && nodes.length === 0 ? null : composer)}
      <MoreSheet
        open={more !== undefined}
        title={more ? `Message from ${name}` : ''}
        onClose={() => setMore(undefined)}
        rows={more ? [{ icon: 'flag-outline', label: 'Report this message', onPress: () => setReporting({ kind: 'chat_message', id: more.id, authorId: otherId, label: 'message' }) }] : []}
      />
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
    </KeyboardAvoidingView>
  );
}
