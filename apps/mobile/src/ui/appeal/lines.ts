// The appeal cards' words: the caption over a decision and the line that says where its appeal stands.
/**
 * M31 W6-B (design-pulse2 shell.html `appealCard`, `appealSent`): the caption is mono caps ("Comment removed · 12 Oct",
 * "Account suspended · 9 Oct"); an appeal not sent yet says "Not appealed yet", one sent says "Appeal sent — waiting for a
 * decision", and a decided one says what was decided. Pure, so it is tested without a screen. (`appealLine` in
 * src/social/appeals-api.ts keeps its older wording for its own callers.)
 */
import type { Appealable } from '@/social/appeals-api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "12 Oct" for an ISO time; empty for a bad one. */
export function dayMonth(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
}

/** "Comment removed · 12 Oct", "Removed · 12 Oct", "Account suspended · 9 Oct". */
export function appealCaption(a: Pick<Appealable, 'action' | 'what' | 'at'>): string {
  const name = a.action === 'suspend' ? 'Account suspended' : /comment/i.test(a.what) ? 'Comment removed' : 'Removed';
  const when = dayMonth(a.at);
  return when ? `${name} · ${when}` : name;
}

/** The state line of a decision: not sent, waiting, or decided. */
export function appealState(a: Pick<Appealable, 'appeal'>): { sent: boolean; text: string } {
  if (!a.appeal) return { sent: false, text: 'Not appealed yet' };
  if (a.appeal.state === 'open') return { sent: true, text: 'Appeal sent — waiting for a decision' };
  return { sent: true, text: a.appeal.state === 'accepted' ? 'Appeal accepted' : 'Appeal not accepted' };
}
