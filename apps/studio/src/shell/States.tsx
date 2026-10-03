// Loading, empty and failed-with-retry blocks, so nothing is ever blank.
import type { ReactNode } from 'react';
import { IconAlert, IconEmpty } from './Icons';

/** FR-029: no block is ever just blank — it is loading, empty with a reason, or failed with a retry. */
export function Loading({ lines = 3, label = 'Loading' }: { lines?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 14, margin: '10px 0', width: `${90 - i * 15}%` }} />
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state">
      <IconEmpty />
      <strong>{title}</strong>
      {children ? <div>{children}</div> : null}
    </div>
  );
}

export function Failed({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="state" role="alert">
      <IconAlert size={32} />
      <strong>This part did not load</strong>
      <div>{message}</div>
      {retry ? <button type="button" className="btn btn-quiet" onClick={retry}>Try again</button> : null}
    </div>
  );
}
