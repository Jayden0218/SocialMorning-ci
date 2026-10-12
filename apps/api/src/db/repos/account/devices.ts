// The signed-in devices list (M26: moved here from routes/account/devices.ts).
import { viaStore } from '../../backend.ts';

export type DeviceRow = { id: string; device_label: string | null; country: string | null; created_at: Date | string; last_seen_at: Date | string; current: boolean };

/** The account's live sessions, this one first. */
export const listDeviceRows = viaStore<typeof import('./ddb/index.ts').listDeviceRows>('ac/index', 'listDeviceRows');

/** One of the account's sessions (not an admin's "act as" one), and whether it is the caller's. */
export const deviceCurrentRows = viaStore<typeof import('./ddb/index.ts').deviceCurrentRows>('ac/index', 'deviceCurrentRows');

/** Sign one session out by its public id. */
export const deleteDevice = viaStore<typeof import('./ddb/index.ts').deleteDevice>('ac/index', 'deleteDevice');

/** Sign out every other session: keep this token's row, the row that replaced it, and the rows that point at either. */
export const signOutOtherDevices = viaStore<typeof import('./ddb/index.ts').signOutOtherDevices>('ac/index', 'signOutOtherDevices');
