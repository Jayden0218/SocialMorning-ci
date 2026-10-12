// The health check's database probe (M26: moved here from app.ts).
import { viaStore } from '../backend.ts';

// M26 lane LE: on DynamoDB one GetItem (safety/ddb/health.ts).
export const ping = viaStore<typeof import('./safety/ddb/health.ts').ping>('sf/health', 'ping');
