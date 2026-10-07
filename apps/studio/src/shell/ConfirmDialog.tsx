// An in-page "are you sure?" dialog; Escape or clicking outside cancels.
import { useEffect, useRef, type ReactNode } from 'react';

/** An in-page dialog (never window.confirm, which would block the page). Esc or the backdrop cancels. */
export function ConfirmDialog({ title, body, confirm, onConfirm, onCancel, busy, children }: {
  title: string; body: string; confirm: string; onConfirm: () => void; onCancel: () => void; busy?: boolean;
  /** Extra fields under the body (M22 US10: the ban reason). */
  children?: ReactNode;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCancel]);
  return (
    <div className="dialog-back" onClick={onCancel}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t" onClick={(e) => e.stopPropagation()}>
        <h2 id="dlg-t">{title}</h2>
        <p className="muted">{body}</p>
        {children}
        <div className="dialog-actions">
          <button ref={first} type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn" disabled={busy} onClick={onConfirm}>{confirm}</button>
        </div>
      </div>
    </div>
  );
}
