// The admin record is append-only: the one Store send path refuses any update, delete or overwrite of an AUDIT# item.
/**
 * M26 lane SF (guard G-M26-SF3; replaces the Postgres trigger `admin_audit_append_only`, migration 014, guard
 * G-A3). Every DynamoDB request of the app goes through `Store.send` (store.ts), so this check there covers
 * every repo, job and script that uses a Store — there is no path that changes a record:
 * - UpdateItem / DeleteItem on an `AUDIT#…` key → refused;
 * - PutItem on an `AUDIT#…` key without `attribute_not_exists(PK)` (an overwrite) → refused;
 * - the same three inside a TransactWriteItems, and any BatchWriteItem request on an `AUDIT#…` key (a batch
 *   cannot carry a condition, so it could overwrite) → refused.
 * Production adds an IAM deny on UpdateItem/DeleteItem for `AUDIT#*` leading keys (data-model.md §3, lane OPS).
 */
import { BatchWriteCommand, DeleteCommand, PutCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

type Rec = Record<string, unknown>;

export class AppendOnlyError extends Error {
  constructor(what: string) {
    super(`admin_audit is append-only: ${what} refused`);
    this.name = 'AppendOnlyError';
  }
}

const AUDIT = 'AUDIT#';
const isAudit = (key: unknown): boolean => typeof (key as Rec | undefined)?.['PK'] === 'string' && String((key as Rec)['PK']).startsWith(AUDIT);
const createOnly = (cond: unknown): boolean => typeof cond === 'string' && /attribute_not_exists\s*\(\s*(PK|#\w+)\s*\)/.test(cond);

/** Throws AppendOnlyError when the command would change or remove an audit record. */
export function assertAppendOnly(cmd: { readonly input: object }): void {
  const input = cmd.input as Rec;
  if (cmd instanceof UpdateCommand && isAudit(input['Key'])) throw new AppendOnlyError('UpdateItem');
  if (cmd instanceof DeleteCommand && isAudit(input['Key'])) throw new AppendOnlyError('DeleteItem');
  if (cmd instanceof PutCommand && isAudit(input['Item']) && !createOnly(input['ConditionExpression'])) throw new AppendOnlyError('PutItem without attribute_not_exists(PK)');
  if (cmd instanceof TransactWriteCommand) {
    for (const t of (input['TransactItems'] as Rec[] | undefined) ?? []) {
      if (isAudit((t['Update'] as Rec | undefined)?.['Key'])) throw new AppendOnlyError('TransactWriteItems Update');
      if (isAudit((t['Delete'] as Rec | undefined)?.['Key'])) throw new AppendOnlyError('TransactWriteItems Delete');
      const p = t['Put'] as Rec | undefined;
      if (p && isAudit(p['Item']) && !createOnly(p['ConditionExpression'])) throw new AppendOnlyError('TransactWriteItems Put without attribute_not_exists(PK)');
    }
  }
  if (cmd instanceof BatchWriteCommand) {
    for (const reqs of Object.values((input['RequestItems'] as Record<string, Rec[]> | undefined) ?? {})) {
      for (const r of reqs) {
        if (isAudit((r['DeleteRequest'] as Rec | undefined)?.['Key']) || isAudit((r['PutRequest'] as Rec | undefined)?.['Item'])) throw new AppendOnlyError('BatchWriteItem');
      }
    }
  }
}
