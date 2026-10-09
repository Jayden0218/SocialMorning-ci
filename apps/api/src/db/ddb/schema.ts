// Reads infra/tables.yaml and creates or drops a table set (tests and rehearsals; production tables come from CloudFormation).
/**
 * M26 F0-05 / F0-08. infra/tables.yaml is JSON-compatible YAML with full-line `#` comments above the
 * opening brace; this drops those lines and parses the rest. Only the key schema, attribute definitions
 * and GSIs are passed to CreateTable — PITR, TTL, SSE, deletion protection and the Stream are AWS-side
 * settings that DynamoDB Local does not model (research R9) and no test relies on.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CreateTableCommand, DeleteTableCommand, waitUntilTableExists, type CreateTableCommandInput, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { TableRole, Tables } from './store.ts';

const TEMPLATE = fileURLToPath(new URL('../../../infra/tables.yaml', import.meta.url));
const ROLE_OF: Record<string, TableRole> = { 'sm-main': 'main', 'sm-events': 'events', 'sm-cache': 'cache' };

type CfnTable = { Type: string; Properties: Record<string, unknown> & { TableName: string } };

export function parseTemplate(text: string): { Resources: Record<string, CfnTable> } {
  const body = text.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
  return JSON.parse(body) as { Resources: Record<string, CfnTable> };
}

/** CreateTable inputs by role, from the template. */
export function tableDefs(text = readFileSync(TEMPLATE, 'utf8')): Record<TableRole, Omit<CreateTableCommandInput, 'TableName'>> {
  const out: Partial<Record<TableRole, Omit<CreateTableCommandInput, 'TableName'>>> = {};
  for (const r of Object.values(parseTemplate(text).Resources)) {
    if (r.Type !== 'AWS::DynamoDB::Table') continue;
    const role = ROLE_OF[r.Properties.TableName];
    if (!role) throw new Error(`tables.yaml: unknown table ${r.Properties.TableName}`);
    const p = r.Properties as Record<string, unknown>;
    out[role] = {
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: p['AttributeDefinitions'] as CreateTableCommandInput['AttributeDefinitions'],
      KeySchema: p['KeySchema'] as CreateTableCommandInput['KeySchema'],
      ...(p['GlobalSecondaryIndexes'] ? { GlobalSecondaryIndexes: p['GlobalSecondaryIndexes'] as CreateTableCommandInput['GlobalSecondaryIndexes'] } : {}),
    };
  }
  for (const role of ['main', 'events', 'cache'] as const) if (!out[role]) throw new Error(`tables.yaml: no ${role} table`);
  return out as Record<TableRole, Omit<CreateTableCommandInput, 'TableName'>>;
}

/** Creates the three tables of a set and waits until each is ACTIVE. */
export async function createTableSet(raw: DynamoDBClient, tables: Tables): Promise<void> {
  const defs = tableDefs();
  for (const role of ['main', 'events', 'cache'] as const) {
    await raw.send(new CreateTableCommand({ TableName: tables[role], ...defs[role] }));
  }
  for (const role of ['main', 'events', 'cache'] as const) {
    await waitUntilTableExists({ client: raw, maxWaitTime: 30, minDelay: 1, maxDelay: 2 }, { TableName: tables[role] });
  }
}

export async function deleteTableSet(raw: DynamoDBClient, tables: Tables): Promise<void> {
  for (const role of ['main', 'events', 'cache'] as const) {
    await raw.send(new DeleteTableCommand({ TableName: tables[role] })).catch(() => undefined);
  }
}
