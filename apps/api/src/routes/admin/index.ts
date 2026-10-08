// Admin router: puts every admin route behind the admin-only check.
/**
 * M15 — `/v1/admin/*` (specs/015-m15-admin/contracts/admin-api.md). Owner-only.
 *
 * The first line below puts EVERY route behind `adminOnly` (Studio session + `admins` + session
 * created < 12 h ago; guard G-A1 enumerates the registered routes to prove it). Every write goes
 * through `adminWrite` — read before, write, read after, one `admin_audit` row, one transaction
 * (G-A2) — except moderation, which goes through `/mod`'s own `act()` (G-U1) and records after it.
 */
import { Hono } from 'hono';
import { adminOnly, type AdminEnv } from '../../auth/admin.ts';
import { registerRecord } from './record.ts';
import { registerPicks } from './picks.ts';
import { registerCurated } from './curated.ts';
import { registerDiscover } from './discover.ts';
import { registerLaunch } from './launch.ts';
import { registerAccounts } from './accounts.ts';
import { registerUsers } from './users.ts';
import { registerMetrics } from './metrics.ts';
import { registerRedeem } from './redeem.ts'; // M24 lane A3
import { registerSafety } from './safety.ts'; // M24 lane A1
import { registerAppeals } from './appeals.ts'; // M24 lane A1
import { registerConfig } from './config.ts'; // M25 lane AC (A7)
import { registerContent } from './content.ts'; // M25 lane AC (A8)

export const admin = new Hono<AdminEnv>();

// G-A1: every route registered on this router is behind this line. Nothing may be registered above it.
admin.use('*', adminOnly);
registerRecord(admin);
registerPicks(admin);
registerCurated(admin);
registerDiscover(admin);
registerLaunch(admin);
registerAccounts(admin);
registerUsers(admin);
registerMetrics(admin);
registerRedeem(admin); // M24 lane A3
registerSafety(admin);
registerAppeals(admin);
registerConfig(admin); // M25 lane AC
registerContent(admin); // M25 lane AC
