// Owner changes to how a show looks in the app, like title, cover, contacts.
/**
 * M11 US6 — how a show appears in the app, set by its owner (FR-024). NULL in a field means
 * "use what the feed says"; the feed stays the source of everything else.
 */
import { viaStore } from '../../backend.ts';

/** M14 US3: a contact has a type, so listeners see the right icon and the value is checked for it (FR-04). */
export const CONTACT_TYPES = ['website', 'email', 'wechat', 'wechat_official', 'weibo', 'jike', 'xiaohongshu'] as const;
export type Contact = { type: (typeof CONTACT_TYPES)[number]; value: string };

export type Overrides = {
  title: string | null; description: string | null; coverUrl: string | null; themeColour: string | null;
  milestoneMessage: string | null; hosts: string[] | null; links: { label: string; url: string }[] | null; updatedAt: string;
  contacts: Contact[] | null; tipsEnabled: boolean;
};

export type OverridesIn = {
  title?: string | null; description?: string | null; coverUrl?: string | null; themeColour?: string | null;
  milestoneMessage?: string | null; hosts?: string[] | null; links?: { label: string; url: string }[] | null;
  contacts?: Contact[] | null; tipsEnabled?: boolean;
};

// DynamoDB bodies: ddb/page.ts (db/backend.ts).
export const getOverrides = viaStore<typeof import('./ddb/page.ts').getOverrides>('st/page', 'getOverrides');
export const putOverrides = viaStore<typeof import('./ddb/page.ts').putOverrides>('st/page', 'putOverrides');
