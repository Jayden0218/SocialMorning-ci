// Database queries for per-show new-episode notifications (M26: moved here from routes/account/notify.ts).
import { viaStore } from '../../backend.ts';

export type NotifyShowRow = { feed_url: string; title: string | null; enabled: boolean | null };

/** Every live subscription with its show title and the listener's switch (null = never set). */
export const listNotifyShowRows = viaStore<typeof import('./ddb/index.ts').listNotifyShowRows>('ac/index', 'listNotifyShowRows');

/** Turn one show's new-episode notification on or off. */
export const setNotifyShow = viaStore<typeof import('./ddb/index.ts').setNotifyShow>('ac/index', 'setNotifyShow');
