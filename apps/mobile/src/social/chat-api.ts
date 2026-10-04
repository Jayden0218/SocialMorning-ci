// Chat server calls (conversations, messages, friends) and merging new messages into a thread.
/**
 * Chat (owner, 2026-10-04): one-to-one messages with people who follow you back. Its own client,
 * like `m12-api.ts`, so the many test fakes of `ApiClient` need no new methods. Same transport.
 * There is no push channel: an open conversation polls `after` the newest id every few seconds.
 */
import { useMemo } from 'react';
import { requester, type ApiDeps, type EpisodeCard } from './api';
import { apiBaseUrl } from './base-url';
import { secureToken } from './token';

export type ChatPerson = { id: string; displayName: string };
export type ChatMessage = { id: string; fromMe: boolean; body: string; episode?: EpisodeCard; createdAt: string; read: boolean };
export type Conversation = { with: ChatPerson; last: ChatMessage; unread: number; canSend: boolean };
export type Thread = { with: ChatPerson; canSend: boolean; messages: ChatMessage[] };

/** The server's limit on one message's text. */
export const CHAT_BODY_MAX = 1000;
/** How often an open conversation asks for new messages. */
export const CHAT_POLL_MS = 5000;

export type ChatApi = ReturnType<typeof createChatApi>;

export function createChatApi(deps: ApiDeps) {
  const call = requester(deps);
  const enc = encodeURIComponent;
  return {
    conversations: async () => (await call<{ conversations: Conversation[] }>('GET', '/v1/me/chats')).json.conversations,
    unread: async () => (await call<{ count: number }>('GET', '/v1/me/chats/unread')).json.count,
    friends: async () => (await call<{ friends: ChatPerson[] }>('GET', '/v1/me/chats/friends')).json.friends,
    thread: async (otherId: string, after?: string) => (await call<Thread>('GET', `/v1/me/chats/${enc(otherId)}${after ? `?after=${enc(after)}` : ''}`)).json,
    send: async (otherId: string, message: { body?: string; episodeId?: string }) => (await call<{ message: ChatMessage }>('POST', `/v1/me/chats/${enc(otherId)}`, message)).json.message,
  };
}

export function useChatApi(): ChatApi {
  return useMemo(() => createChatApi({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
}

/**
 * Adds `incoming` to `known`, oldest first, each id once. A message the poll returns again (or
 * the one just sent, which the poll also sees) replaces the copy we had, so `read` updates.
 */
export function mergeMessages(known: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
  const byId = new Map(known.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => byIdOrder(a.id, b.id));
}

/** Ids are whole numbers as text: a shorter one is smaller, equal lengths compare as text. */
function byIdOrder(a: string, b: string): number {
  return a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0;
}

/** The newest message id, the poll's `after`. */
export function newestId(messages: readonly ChatMessage[]): string | undefined {
  return messages.length > 0 ? messages[messages.length - 1]!.id : undefined;
}

/** One line for the conversation list: the text, or the episode it carries. */
export function previewOf(m: ChatMessage): string {
  const text = m.body.trim();
  const line = text !== '' ? text : m.episode ? `Shared an episode: ${m.episode.title}` : '';
  return m.fromMe ? `You: ${line}` : line;
}
