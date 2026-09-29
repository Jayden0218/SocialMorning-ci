import { useState, type ReactNode } from 'react';
import type { Show } from '../api';
import { IconMenu } from './Icons';
import { Sidebar } from './Sidebar';

export function Layout({ show, children }: { show: Show; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="layout">
      <Sidebar show={show} open={open} onNavigate={() => setOpen(false)} />
      <main className="main" id="main">
        <button type="button" className="menu-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <IconMenu />Menu
        </button>
        {children}
      </main>
    </div>
  );
}
