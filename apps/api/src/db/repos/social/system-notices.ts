// System notices: messages from SocialNet to everyone or to one listener, and their optional push.
/**
 * M24 US3. Written in Admin (to everyone) or by the server itself (to one listener: "your comment
 * was removed", an appeal's answer). The phone's System page lists them (app/notifications/system.tsx).
 * A card's one button is an in-app path (`link_route` starts with "/"; the phone's `systemAction`
 * drops anything else).
 *
 * A push is optional and respects the listener's "System notices" switch (push_prefs.system,
 * migration 026 — M24 fix F-S; before it, notices rode on "Popular content"). A listener who
 * turned it off is never pushed.
 */
import { viaStore } from '../../backend.ts';

export const NOTICE_TITLE_MAX = 80;
export const NOTICE_BODY_MAX = 1000;
export const NOTICES_PAGE = 50;
/** Where a notice push opens on the phone (src/notify/route.ts allows it). */
export const NOTICES_HREF = '/notifications/system';

export type NoticeIn = { title: string; body: string; link?: { label: string; route: string }; push?: boolean; listenerId?: string | null; createdBy?: string | null };
export type NoticeOut = { id: string; title: string; body: string; createdAt: string; action?: { label: string; route: string }; to: 'everyone' | 'you'; push: boolean };

// Bodies in graph-ddb/ (src/db/backend.ts).
export const insertNotice = viaStore<typeof import('./graph-ddb/index.ts').insertNotice>('sg/index', 'insertNotice');
export const noticesFor = viaStore<typeof import('./graph-ddb/index.ts').noticesFor>('sg/index', 'noticesFor');
export const broadcastNotices = viaStore<typeof import('./graph-ddb/index.ts').broadcastNotices>('sg/index', 'broadcastNotices');
export const deleteNotice = viaStore<typeof import('./graph-ddb/index.ts').deleteNotice>('sg/index', 'deleteNotice');
export const pushNotice = viaStore<typeof import('./graph-ddb/index.ts').pushNotice>('sg/index', 'pushNotice');
