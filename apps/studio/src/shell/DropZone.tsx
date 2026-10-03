// A box to drop or choose an image file, showing the current one.
import { useState, type DragEvent } from 'react';

/** M14 US1: a cover drop box inside the form — drop an image or click to choose; shows the current one. */
export function DropZone({ label, url, busyPct, onFile, accept = 'image/jpeg,image/png', size = 140 }: {
  label: string; url: string | null; busyPct: number | null; onFile: (f: File) => void; accept?: string; size?: number;
}) {
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); };
  return (
    <label className={`dropzone${over ? ' over' : ''}`} style={{ width: size, height: size }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      {url ? <img src={url} alt="" /> : null}
      <span className="dropzone-text">{busyPct !== null ? `Uploading… ${busyPct}%` : url ? 'Replace' : label}</span>
      <input type="file" accept={accept} className="sr-only" aria-label={label} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </label>
  );
}
