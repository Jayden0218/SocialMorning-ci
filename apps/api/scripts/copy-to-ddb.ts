// Copies the frozen Postgres into DynamoDB: every table's rows become the items each lane's code writes. Idempotent, resumable, counts only.
/**
 * M26 lane MIG, MIG-01 (data-model.md §15, plan.md "Cutover" step 4; runbook docs/runbooks/m26-cutover.md).
 *
 *   cd apps/api && DATABASE_URL=<frozen branch> DDB_ENDPOINT=http://localhost:8000 \
 *     npx tsx scripts/copy-to-ddb.ts --prefix rehearsal1 [--state copy-state.json] [--only a,b] [--skip a,b] [--create-tables]
 *   … --prod --aws   (cutover; the owner's AWS account — runbook)
 *
 * - Every lane module (scripts/copy/registry.ts) lists its sources; each source is read page by page and its items
 *   written with BatchWrite (25 per call, unprocessed items re-sent).
 * - Running it twice gives the same items: every item is a whole Put of values taken from the rows.
 * - `--state <file>` records the sources done and the cursor of the one in progress after every page: a run that
 *   stops (network, laptop asleep) is started again with the same command and goes on from there.
 *   `--restart` ignores an existing state file.
 * - Prints per source "rows → items", never a row.
 */
import { existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createTableSet } from '../src/db/ddb/schema.ts';
import { createDdbClients } from '../src/db/ddb/client.ts';
import { copyToDdb } from './copy/engine.ts';
import { connect, parseArgs } from './copy/connect.ts';
import { MODULES } from './copy/registry.ts';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const c = await connect(args);
  try {
    if (args['create-tables']) {
      if (args['prod']) throw new Error('--create-tables is for a scratch set; production tables come from infra (OPS)');
      const clients = createDdbClients({ allowAws: args['aws'] === true });
      await createTableSet(clients.raw, c.store.tables);
      clients.raw.destroy();
    }
    const stateFile = typeof args['state'] === 'string' ? args['state'] : 'copy-state.json';
    if (args['restart'] && existsSync(stateFile)) unlinkSync(stateFile);
    const list = (k: string) => (typeof args[k] === 'string' ? (args[k] as string).split(',') : undefined);
    const started = Date.now();
    const r = await copyToDdb({
      pg: c.pg, store: c.store, modules: MODULES, stateFile,
      ...(list('only') ? { only: list('only')! } : {}), ...(list('skip') ? { skip: list('skip')! } : {}),
      log: (l) => console.log(l),
    });
    console.log(`copy-to-ddb: ${r.sources} sources, ${Object.values(r.rows).reduce((a, b) => a + b, 0)} rows → ${r.totalItems} items in ${Math.round((Date.now() - started) / 1000)} s`);
  } finally {
    await c.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
}
