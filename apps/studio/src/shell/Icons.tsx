/** Our own line icons (24 px grid, 1.8 stroke, currentColor) — nothing copied (FR-028). */
import type { ReactNode } from 'react';

const Svg = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
);

export const IconHome = () => <Svg><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5h4v5" /></Svg>;
export const IconChart = () => <Svg><path d="M4 20V4" /><path d="M4 20h16" /><path d="m7 15 4-4 3 3 5-6" /></Svg>;
export const IconEpisodes = () => <Svg><rect x="3" y="4" width="18" height="13" rx="2.5" /><path d="M8 21h8" /><path d="m10.5 8.5 4 2-4 2z" /></Svg>;
export const IconComments = () => <Svg><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></Svg>;
export const IconPeople = () => <Svg><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.4 3.4-5.5 6.5-5.5s5.7 2.1 6.5 5.5" /><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.5.8 2.6 2.6 3 5.2" /></Svg>;
export const IconMegaphone = () => <Svg><path d="M4 10v4h3l7 4V6l-7 4z" /><path d="M18 9a4 4 0 0 1 0 6" /></Svg>;
export const IconPoll = () => <Svg><path d="M5 20V11M12 20V5M19 20v-6" /></Svg>;
export const IconCoin = () => <Svg><circle cx="12" cy="12" r="8.5" /><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.5.8-2.5 1.9 0 2.6 5 1.3 5 4.2 0 1.1-1.1 1.9-2.5 1.9-1.2 0-2.1-.5-2.6-1.3M12 6.5V8m0 8v1.5" /></Svg>;
export const IconSettings = () => <Svg><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" /></Svg>;
export const IconMenu = () => <Svg><path d="M4 7h16M4 12h16M4 17h16" /></Svg>;
export const IconAlert = ({ size }: { size?: number }) => <Svg size={size}><path d="M12 3 2.5 20h19z" /><path d="M12 10v4.5M12 17.5v.01" /></Svg>;
export const IconEmpty = ({ size = 40 }: { size?: number }) => <Svg size={size}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14.5c1 1 2.1 1.5 3.5 1.5s2.5-.5 3.5-1.5M9 9.5v.01M15 9.5v.01" /></Svg>;
