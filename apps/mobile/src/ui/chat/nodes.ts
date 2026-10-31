// Groups a conversation's messages into the nodes of the spine: a new node after a gap of more than 10 minutes.
/**
 * M31 W4-C (T052; `social.html#chat-thread--screen` notes: "a raise tick marks each time gap over 10 minutes ("Mon", "9:12")").
 * A node holds the messages that follow each other within 10 minutes. Its tick says when it began: the clock ("9:12") on
 * today's page and on a day already named by the node above it, else the weekday ("Mon") inside the last week, else the
 * date ("27 Oct"). Pure: tested without a phone.
 */
import type { ChatMessage } from '@/social/chat-api';
import { CHAT } from './measures';

export type ChatNode = { key: string; tick: string; messages: ChatMessage[] };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const DAY = 24 * 60 * 60 * 1000;

const sameDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "9:12" on this phone's clock (the hour is not padded, as drawn). */
export function clockLabel(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The tick for a node that began at `at`, under a node that began at `prev` (if any). */
export function tickLabel(at: Date, prev: Date | undefined, now: Date): string {
  if (sameDay(at, now) || (prev !== undefined && sameDay(at, prev))) return clockLabel(at);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (startOfToday - at.getTime() < 6 * DAY) return WEEKDAYS[at.getDay()]!;
  return `${at.getDate()} ${MONTHS[at.getMonth()]}`;
}

/** Messages (oldest first) into nodes. */
export function chatNodes(messages: readonly ChatMessage[], now: Date): ChatNode[] {
  const out: ChatNode[] = [];
  let prevStart: Date | undefined;
  let lastAt = Number.NEGATIVE_INFINITY;
  for (const m of messages) {
    const at = Date.parse(m.createdAt);
    const last = out[out.length - 1];
    if (last && at - lastAt <= CHAT.tickGapMs) {
      last.messages.push(m);
    } else {
      const start = new Date(at);
      out.push({ key: m.id, tick: tickLabel(start, prevStart, now), messages: [m] });
      prevStart = start;
    }
    lastAt = at;
  }
  return out;
}
