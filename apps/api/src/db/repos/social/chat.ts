// Chat messages between two listeners who follow each other: send, read, list conversations.
/**
 * Chat (owner, 2026-10-04). Two people may chat only while they follow each other and neither
 * has blocked the other; a suspended account is refused by `requireAuth` and hidden from lists.
 * Old messages stay readable after an unfollow, but nobody can send until both follow again.
 */
import { viaStore } from '../../backend.ts';

export const CHAT_BODY_MAX = 1000;
export const CHAT_PAGE = 50;

export type ChatEpisode = { id: string; feedUrl: string; guid: string; title: string; showTitle: string; enclosureUrl: string; imageUrl?: string; durationMs?: number };
export type ChatMessage = { id: string; fromMe: boolean; body: string; episode?: ChatEpisode; createdAt: string; read: boolean };
export type ChatPerson = { id: string; displayName: string; avatarUrl?: string };
export type Conversation = { with: ChatPerson; last: ChatMessage; unread: number; canSend: boolean };

/** M19 US1: a chat person carries their photo when they set one. */
export function toPerson(r: { id: string; display_name: string; avatar_url: string | null }): ChatPerson {
  return { id: r.id, displayName: r.display_name, ...(r.avatar_url ? { avatarUrl: r.avatar_url } : {}) };
}

// Bodies in ddb/chat.ts (src/db/backend.ts).
export const canChat = viaStore<typeof import('./ddb/chat.ts').canChat>('sc/chat', 'canChat');
export const person = viaStore<typeof import('./ddb/chat.ts').person>('sc/chat', 'person');
export const send = viaStore<typeof import('./ddb/chat.ts').send>('sc/chat', 'send');
export const thread = viaStore<typeof import('./ddb/chat.ts').thread>('sc/chat', 'thread');
export const conversations = viaStore<typeof import('./ddb/chat.ts').conversations>('sc/chat', 'conversations');
export const unreadCount = viaStore<typeof import('./ddb/chat.ts').unreadCount>('sc/chat', 'unreadCount');
export const friends = viaStore<typeof import('./ddb/chat.ts').friends>('sc/chat', 'friends');
