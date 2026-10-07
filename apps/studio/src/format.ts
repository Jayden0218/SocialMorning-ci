// Formats numbers, percents, times and dates for display.
const nf = new Intl.NumberFormat('en');

export const num = (n: number): string => nf.format(n);
export const pct = (r: number | null): string => (r === null ? '—' : `${Math.round(r * 100)}%`);
export const mmss = (ms: number | null): string => {
  if (ms === null) return '';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};
export const shortDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const axisDate = (d: string): string => {
  const [, m, day] = d.split('-');
  return `${Number(day)}/${Number(m)}`;
};
export const browserTz = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};
/** Days since the claim was proven, counting that day as day 1. */
export const dayNumber = (since: string | null, now = Date.now()): number | null =>
  since ? Math.max(1, Math.floor((now - new Date(since).getTime()) / 86_400_000) + 1) : null;
