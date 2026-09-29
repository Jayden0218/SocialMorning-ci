import { useState, type ReactNode } from 'react';
import type { Show } from '../api';
import { IconMenu } from './Icons';
import { Sidebar } from './Sidebar';
import { UnsavedProvider } from './Unsaved';

export function Layout({ show, children }: { show: Show; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <UnsavedProvider>
    <div className="layout">
      <Sidebar show={show} open={open} onNavigate={() => setOpen(false)} />
      <main className="main" id="main">
        <button type="button" className="menu-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <IconMenu />Menu
        </button>
        {/* M14 US6: the show's name, large and faint, behind the page head (decorative). */}
        <div className="watermark" aria-hidden="true">{show.title ?? ''}</div>
        {children}
      </main>
    </div>
    </UnsavedProvider>
  );
}
