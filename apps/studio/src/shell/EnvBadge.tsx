// A small fixed-corner badge saying which environment this Studio is (DEV, QA or STAGING); nothing on prod.
/**
 * M30 T017. `VITE_APP_ENV` is set per Vercel project (docs/runbooks/free-envs.md). Prod, empty, unset or any unknown
 * value shows nothing. Colours are the existing token variables only (test/tokens.test.ts forbids literals), each pair one the
 * contrast test already measures: QA = onFill on primary (yellow), DEV = background on text, STAGING = background on accent.
 */
export const BADGES: Record<string, { label: string; bg: string; fg: string }> = {
  dev: { label: 'DEV', bg: 'var(--text)', fg: 'var(--background)' },
  qa: { label: 'QA', bg: 'var(--primary)', fg: 'var(--on-fill)' },
  staging: { label: 'STAGING', bg: 'var(--accent)', fg: 'var(--background)' },
};

export function EnvBadge() {
  const env = String(import.meta.env['VITE_APP_ENV'] ?? '').toLowerCase();
  const b = BADGES[env];
  if (!b) return null;
  return (
    <div
      role="note"
      aria-label={`${b.label} environment`}
      style={{ position: 'fixed', top: 0, right: 0, zIndex: 1000, padding: '2px 8px', borderBottomLeftRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', background: b.bg, color: b.fg, pointerEvents: 'none' }}
    >
      {b.label}
    </div>
  );
}
