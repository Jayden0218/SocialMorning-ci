// One conversation: messages oldest to newest, new ones every 5 seconds, write and send.
/**
 * A conversation (owner, 2026-10-04) at `/chat/<listenerId>`. The bar shows the person's name
 * (tap → their profile). Messages arrive by polling `after` the newest id every 5 s while the
 * page is open. The box at the bottom sends text (≤ 1000 characters); a page opened from
 * Share → "Send in chat" carries `episodeId` and shows that episode above the box until it is
 * sent or removed. When the two of you no longer follow each other, the box is replaced by a
 * line that says why — the history stays.
 */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { RNFlatList } from '@/ui/lib/flat-list';
import { KeyboardAvoidingView } from '@/ui/lib/keyboard-avoiding-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { hit } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { Loader } from '@/ui/kit/Loader';
import { PageHeader } from '@/ui/kit/PageHeader';
import { useColours } from '@/ui/kit/useColours';
import { useStores, useToast } from '@/ui/shell/providers';
import { MessageBubble } from '@/ui/chat/MessageBubble';
import { useCardActions } from '@/discover/useDiscover';
import { ApiError } from '@/social/api';
import { useSocial } from '@/social/context';
import { registrationFor } from '@/social/registration';
import { CHAT_BODY_MAX, CHAT_POLL_MS, mergeMessages, newestId, useChatApi, type ChatMessage, type ChatPerson } from '@/social/chat-api';

const TAP = { minHeight: hit.min };
const BOX = { minHeight: hit.min, maxHeight: 120 };

export default function ChatThread(): React.ReactElement {
  const params = useLocalSearchParams<{ id: string; name?: string; episodeId?: string; episodeTitle?: string }>();
  const otherId = String(params.id);
  const stores = useStores();
  const c = useColours(stores.settings);
  const toast = useToast();
  const { api, listener } = useSocial();
  const chat = useChatApi();
  const { open } = useCardActions();
  const list = useRef<RNFlatList<ChatMessage>>(null);

  const [who, setWho] = useState<ChatPerson | undefined>(params.name ? { id: otherId, displayName: String(params.name) } : undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [canSend, setCanSend] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [draft, setDraft] = useState('');
  const [attach, setAttach] = useState<{ id: string; title: string } | undefined>(
    params.episodeId ? { id: String(params.episodeId), title: String(params.episodeTitle ?? 'Episode') } : undefined,
  );
  const [sending, setSending] = useState(false);
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
        if (reg) await api.registerEpisode(attach.id, reg).catch(() => undefined);
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

  const name = who?.displayName ?? 'Chat';
  const header = (
    <PageHeader
      middle={
        <Pressable
          onPress={() => router.push({ pathname: '/profile/[id]', params: { id: otherId } })}
          accessibilityRole="link"
          accessibilityLabel={`${name}, open profile`}
          className="flex-1 items-center justify-center"
          style={TAP}
        >
          <Text className="text-text text-sm font-bold" numberOfLines={1} accessibilityRole="header">{name}</Text>
        </Pressable>
      }
    />
  );

  if (!listener) {
    return (
      <>
        {header}
        <Box className="flex-1 bg-background items-center justify-center gap-row px-screen-x">
          <Text className="text-muted text-body text-center">Sign in to chat.</Text>
          <Pressable onPress={() => router.push('/auth/sign-in')} accessibilityRole="button" accessibilityLabel="Sign in" className="bg-primary rounded-pill px-section justify-center" style={TAP}>
            <Text className="text-onPrimary text-body font-bold">Sign in</Text>
          </Pressable>
        </Box>
      </>
    );
  }

  // "Read" goes under my newest message only.
  const lastMine = [...messages].reverse().find((m) => m.fromMe)?.id;

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {header}
      <RNFlatList
        ref={list}
        className="flex-1"
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerClassName="py-row flex-grow justify-end"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={!loaded ? <Loader className="my-section" /> : error ? (
          <Text className="text-muted text-sm text-center px-screen-x my-section">{error}</Text>
        ) : (
          <Text className="text-muted text-sm text-center px-screen-x my-section">{`Say hello to ${name}.`}</Text>
        )}
        renderItem={({ item }) => <MessageBubble message={item} showRead={item.id === lastMine} onOpenEpisode={(e) => void open(e)} />}
      />
      {canSend ? (
        <Box className="bg-surface border-t-hairline border-separator px-screen-x pt-2 pb-2 gap-2">
          {attach ? (
            <Box className="flex-row items-center gap-row bg-background border border-border rounded-row py-1 pl-row pr-1">
              <Icon name="headset-outline" size={18} color={c.accent} />
              <Text className="flex-1 text-text text-meta" numberOfLines={1}>{attach.title}</Text>
              <Pressable onPress={() => setAttach(undefined)} accessibilityRole="button" accessibilityLabel="Remove the episode" className="items-center justify-center w-11" style={TAP}>
                <Icon name="close" size={18} color={c.muted} />
              </Pressable>
            </Box>
          ) : null}
          <Box className="flex-row items-end gap-2">
            <Textarea className="flex-1 h-auto border border-border rounded-row bg-background px-row" style={BOX}>
              <TextareaInput
                placeholderTextColor={c.muted}
                className="py-2 text-body text-text"
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
              className={`bg-primary rounded-pill items-center justify-center w-12 ${cannot ? 'opacity-50' : ''}`}
              style={TAP}
            >
              <Icon name="chevron-up" size={22} color={c.onPrimary} />
            </Pressable>
          </Box>
          {over ? <Text className="text-accent text-meta text-right">{`${body.length} / ${CHAT_BODY_MAX}`}</Text> : null}
        </Box>
      ) : (
        <Box className="bg-surface border-t-hairline border-separator px-screen-x py-row">
          <Text className="text-muted text-sm text-center">You can send messages while you both follow each other.</Text>
        </Box>
      )}
    </KeyboardAvoidingView>
  );
}
