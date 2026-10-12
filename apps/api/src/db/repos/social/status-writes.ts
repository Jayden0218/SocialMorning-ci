// Status route writes and checks: a text status with its items in one transaction, a listener check, image bytes used.
import { viaStore } from '../../backend.ts';

// Bodies in ddb/status-writes.ts (src/db/backend.ts).
export const insertTextStatusInTx = viaStore<typeof import('./ddb/status-writes.ts').insertTextStatusInTx>('sc/status-writes', 'insertTextStatusInTx');
export const listenerExistsRows = viaStore<typeof import('./ddb/status-writes.ts').listenerExistsRows>('sc/status-writes', 'listenerExistsRows');
export const liveCommentImageBytesRows = viaStore<typeof import('./ddb/status-writes.ts').liveCommentImageBytesRows>('sc/status-writes', 'liveCommentImageBytesRows');
