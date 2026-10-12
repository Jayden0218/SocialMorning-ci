// Removes the demo account, its 6 helpers and everything scripts/seed-demo.ts wrote for them — on DynamoDB.
/**
 *   cd apps/api && npx tsx scripts/unseed-demo.ts --prefix <set>    (or --prod --aws; a leftover --ddb is ignored)
 *
 * M26 lane MIG (MIG-05): deletes only the emails in DEMO_ACCOUNTS, through the account-deletion path (`finishDeletion`: the deletion job run to the end). A demo comment a real listener replied to stays as a placeholder, as a real delete
 * leaves it. Then apps/api/.env.demo-account is removed. Running it twice changes nothing the second time.
 */
import { existsSync, unlinkSync } from 'node:fs';
import { LOGIN_FILE, openBackend, removeDemo } from './seed-demo.ts';

const b = await openBackend(process.argv.slice(2));
try {
  const n = await removeDemo(b.db);
  console.log(n === 0 ? 'No demo accounts found; nothing to remove.' : `Removed ${n} demo accounts and their content.`);
  if (existsSync(LOGIN_FILE)) { unlinkSync(LOGIN_FILE); console.log('Removed apps/api/.env.demo-account.'); }
} finally {
  await b.close();
}
