// An in-page "are you sure?" dialog; Escape or clicking outside cancels.
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * An in-page dialog (never window.confirm, which would block the page). Esc or the backdrop cancels.
 * M23 T042: focus moves in once when it opens (not on every parent render), Tab and Shift+Tab stay
 * inside it, and focus goes back to whatever opened it when it closes.
 */
export function ConfirmDialog({ title, body, confirm, onConfirm, onCancel, busy, children }: {
  title: string; body: string; confirm: string; onConfirm: () => void; onCancel: () => void; busy?: boolean;
  /** Extra fields under the body (M22 US10: the ban reason). */
  children?: ReactNode;
}) {
  const first = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    first.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel.current(); };
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('keydown', esc);
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);
  const trap = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !box.current) return;
    const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const head = items[0]!;
    const tail = items[items.length - 1]!;
    const at = document.activeElement;
    if (e.shiftKey && (at === head || !box.current.contains(at))) { e.preventDefault(); tail.focus(); }
    else if (!e.shiftKey && (at === tail || !box.current.contains(at))) { e.preventDefault(); head.focus(); }
  };
  return (
    <div className="dialog-back" onClick={onCancel}>
      <div ref={box} className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t" onClick={(e) => e.stopPropagation()} onKeyDown={trap}>
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
