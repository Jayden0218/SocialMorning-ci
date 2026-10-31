// M30 T031 + T032 (specs/032-m30-four-environments): the approval list in docs/environments.md against apps/api/infra/stack.json.
//   node scripts/check-approvals.mjs                          every billable resource TYPE in the stack has a row (first column, backticked)
//   node scripts/check-approvals.mjs --require-approved <staging|prod>
//                                                             the deploy preflight: also every row of a type the stack creates is APPROVED
//                                                             ('Approved by' = a name that is not empty / a dash, and Date = 20YY-MM-DD)
// Exit 1 lists what is missing / not approved. Paths can be overridden (tests, red runs on a temp copy):
//   CHECK_APPROVALS_PAGE=<page.md>  CHECK_APPROVALS_STACK=<stack.json>
// Without docs/ (the public CI mirror never has it) the plain check SKIPS, visibly, and exits 0. The --require-approved mode never
// skips: a deploy that cannot read the approval list must refuse.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Types that cost nothing by themselves: a permission or a retry setting has no price, and an event source mapping is not billed
// (the Stream reads it makes are counted against the DynamoDB table's free reads). They need no row; if the page has one, it is still read.
export const FREE_TYPES = new Set(['AWS::Lambda::Permission', 'AWS::Lambda::EventInvokeConfig', 'AWS::Lambda::EventSourceMapping']);

/** The resource types a CloudFormation template creates (Parameters etc. are not resources). */
export function stackTypes(stackJson) {
  const t = JSON.parse(stackJson);
  return [...new Set(Object.values(t.Resources ?? {}).map((r) => r.Type))].sort();
}

/** Rows of the approval table: [{ type, approvedBy, date }]. Only lines whose first cell is a backticked AWS:: type, after the heading. */
export function parseApprovalRows(markdown) {
  const at = markdown.search(/^#+\s*The approval list/im);
  const rows = [];
  if (at < 0) return rows;
  for (const line of markdown.slice(at).split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    const m = /^`([A-Za-z0-9]+::[A-Za-z0-9]+::[A-Za-z0-9]+)`$/.exec(cells[0] ?? '');
    if (!m || cells.length < 3) continue;
    rows.push({ type: m[1], approvedBy: cells[cells.length - 2], date: cells[cells.length - 1] });
  }
  return rows;
}

const FILLERS = new Set(['-', '\u2014', '\u2013', 'x', 'tbd', 'todo', 'n/a', 'none']);
function realDate(t) {
  const m = /^(20\d\d)-(\d\d)-(\d\d)$/.exec(t);
  if (!m) return false;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dt.getUTCFullYear() === +m[1] && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3];
}
export const isApproved = (row) => {
  const by = String(row.approvedBy ?? '').trim();
  return by.length >= 2 && !FILLERS.has(by.toLowerCase()) && !/^[\u2014\u2013-]+$/.test(by) && realDate(String(row.date ?? '').trim());
};

/** { missing: types with no row, unapproved: types whose row is not approved }. Free types need no row. */
export function check(types, rows) {
  const have = new Map(rows.map((r) => [r.type, r]));
  const missing = types.filter((t) => !FREE_TYPES.has(t) && !have.has(t));
  const unapproved = types.filter((t) => have.has(t) && !isApproved(have.get(t)));
  return { missing, unapproved };
}

function main(argv, env) {
  const i = argv.indexOf('--require-approved');
  const target = i >= 0 ? argv[i + 1] : null;
  if (i >= 0 && !['staging', 'prod'].includes(target)) { console.error('usage: check-approvals.mjs [--require-approved <staging|prod>]'); return 2; }
  const page = env.CHECK_APPROVALS_PAGE ?? join(ROOT, 'docs/environments.md');
  const stack = env.CHECK_APPROVALS_STACK ?? join(ROOT, 'apps/api/infra/stack.json');
  if (!existsSync(page)) {
    if (target) { console.error(`deploy refused: the approval list (${page}) cannot be read`); return 1; }
    console.log(`SKIP: ${page} is absent (the public CI mirror has no docs/)`);
    return 0;
  }
  if (!existsSync(stack)) { console.error(`${stack} is absent`); return 1; }
  const { missing, unapproved } = check(stackTypes(readFileSync(stack, 'utf8')), parseApprovalRows(readFileSync(page, 'utf8')));
  let bad = 0;
  if (missing.length) { bad = 1; console.error(`approval list lacks a row for: ${missing.join(', ')}`); }
  if (target && unapproved.length) {
    bad = 1;
    console.error(`deploy to ${target} refused: no owner name + date (YYYY-MM-DD) in the approval list for: ${unapproved.join(', ')}`);
  }
  if (!bad) console.log(target ? `every resource type of the stack is approved for ${target}` : 'every billable resource type of the stack has an approval-list row');
  return bad;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2), process.env));
