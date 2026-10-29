// The Chat list's time stamp: "now", "2m", "1h", "Yesterday", "Mon", "12 Oct".
/**
 * M31 F2a (design-pulse2 `chat--screen`: 2m · 1h · Yesterday · Mon). Only the Chat list uses it — the shared `ago()` ("1 h ago") stays
 * for the other pages. Minutes and hours count from the message; from 24 hours on it counts calendar days in the phone's zone:
 * the day before is "Yesterday", up to six days back the weekday, then the day and month (and the year when it is not this one).
 */
const DAY = 86_400_000;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const dayStart = (t: number): number => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

export function chatTime(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const ms = Math.max(0, now - at);
  if (ms < 60_000) return 'now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < DAY) return `${Math.floor(ms / 3_600_000)}h`;
  const days = Math.round((dayStart(now) - dayStart(at)) / DAY);
  if (days <= 1) return 'Yesterday';
  const d = new Date(at);
  if (days < 7) return WEEKDAY[d.getDay()]!;
  const base = `${d.getDate()} ${MONTH[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base} ${d.getFullYear()}`;
}
