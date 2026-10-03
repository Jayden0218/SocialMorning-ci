// Save bar and warning before leaving a page with unsaved changes.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * M14 US1 (FR-01): leaving a page with unsaved edits asks first — an in-page dialog for links
 * inside the Studio, the browser's own prompt for closing the tab. Never `window.confirm`.
 */
type Ctx = { setDirty: (d: boolean) => void; guard: (to: string) => (e: MouseEvent) => void };
const UnsavedCtx = createContext<Ctx>({ setDirty: () => undefined, guard: () => () => undefined });

export function UnsavedProvider({ children }: { children: ReactNode }) {
  const dirty = useRef(false);
  const [asking, setAsking] = useState<string | null>(null);
  const navigate = useNavigate();
  const setDirty = useCallback((d: boolean) => { dirty.current = d; }, []);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, []);
  const guard = useCallback((to: string) => (e: MouseEvent) => {
    if (!dirty.current) return;
    e.preventDefault();
    setAsking(to);
  }, []);
  return (
    <UnsavedCtx.Provider value={{ setDirty, guard }}>
      {children}
      {asking ? (
        <ConfirmDialog title="Leave without saving?" body="Your changes on this page are not saved yet." confirm="Leave"
          onCancel={() => setAsking(null)} onConfirm={() => { dirty.current = false; const to = asking; setAsking(null); navigate(to); }} />
      ) : null}
    </UnsavedCtx.Provider>
  );
}

export const useUnsaved = () => useContext(UnsavedCtx);

/** Tell the guard whether this page has unsaved edits; cleared when the page goes away. */
export function useDirty(dirty: boolean) {
  const { setDirty } = useUnsaved();
  useEffect(() => { setDirty(dirty); }, [dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);
}

/** The sticky bar at the bottom of a settings form: says what saving does; Save only when something changed. */
export function SaveBar({ dirty, busy, onSave, onReset, note }: { dirty: boolean; busy: boolean; onSave: () => void; onReset: () => void; note: string }) {
  return (
    <div className="savebar" role="region" aria-label="Save changes">
      <span className="muted">{dirty ? 'You have unsaved changes.' : note}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        {dirty ? <button type="button" className="btn btn-quiet" onClick={onReset} disabled={busy}>Undo changes</button> : null}
        <button type="button" className="btn" onClick={onSave} disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  );
}
