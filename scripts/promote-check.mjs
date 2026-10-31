// M30 T018 (specs/032-m30-four-environments, FR-003/FR-004/FR-042): may this commit be promoted into `to`?
// A pure function over GitHub Deployments (joined with their latest status). It reads nothing, deploys nothing.
//   dev -> qa -> staging -> prod. A promotion needs a `success` of the SAME sha in the environment before it.
//   Hotfix: a ref starting `hotfix/` may enter staging without qa (it still needs staging before prod).
// Environment names (T041/P2): GitHub Deployments carry different names depending on who made them.
//   exact:   dev qa staging prod, plus the AWS spellings production / stg / sm (the deploy workflows record no deployment
//            of their own today, so these are the names a later step would use; nothing else maps to staging or prod).
//   Vercel:  "Production – qa-api", "Production – dev-studio" (en dash; hyphen and em dash also read; a "Preview – …" name never counts, FR-004). Only projects named
//            dev-* or qa-* count. RULE: only the *-api project counts for health; a *-studio project is ignored, so a
//            Studio failure never blocks a promotion. Any other project name is ignored.
// Data shape (T041, FR-041): a diff touching the key layout or a table definition needs backwardCompatible + a reason.
// Hotfix (P4): the branch must exist, contain the commit, and have main as an ancestor (booleans, computed by promote.yml).
// CLI: TO=staging COMMIT=<sha> REF=main [BACKWARD_COMPATIBLE=true COMPAT_REASON=… CHANGED_FILES_FILE=f.txt
//   BRANCH_EXISTS=true CONTAINS_COMMIT=true MAIN_IS_ANCESTOR=true] node scripts/promote-check.mjs deployments.json
//   prints the reason, exits 1 when refused, and writes allowed=… / reason=… to $GITHUB_OUTPUT when set.
import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PREVIOUS = { qa: 'dev', staging: 'qa', prod: 'staging' };
const FAILED = new Set(['failure', 'error']);
const EXACT = { dev: 'dev', qa: 'qa', staging: 'staging', stg: 'staging', prod: 'prod', production: 'prod', sm: 'prod' };
const DATA_SHAPE_FILES = [
  'apps/api/src/db/ddb/keys.ts', 'apps/api/infra/tables.yaml', 'apps/api/infra/stack.json', 'apps/api/infra/free-stack.json',
];

// -> { env: 'dev'|'qa'|'staging'|'prod'|null, role: 'api'|'studio'|'other' }
export function normalizeEnvironment(name) {
  if (typeof name !== 'string') return { env: null, role: 'other' };
  const n = name.trim();
  if (Object.hasOwn(EXACT, n.toLowerCase())) return { env: EXACT[n.toLowerCase()], role: 'api' };
  // FR-004: only a Production deployment of dev-*/qa-* (a push to the project's production branch) counts. A Preview
  // deployment (any feature branch) maps to nothing, so an unreviewed branch can never satisfy "in qa".
  const v = n.match(/^Production\s*[\u2013\u2014-]\s*(.+)$/i);
  if (!v) return { env: null, role: 'other' };
  const project = v[1].trim().toLowerCase();
  const m = project.match(/^(dev|qa)-(api|studio)$/);
  if (!m) return { env: null, role: 'other' };
  return { env: m[1], role: m[2] };
}

export function touchesDataShape(changedFiles = []) {
  return (Array.isArray(changedFiles) ? changedFiles : []).some((f) => DATA_SHAPE_FILES.includes(String(f).trim()));
}

export function checkPromotion({ to, commit, ref = '', deployments = [], backwardCompatible = false, compatReason = '', changedFiles = [], hotfix } = {}) {
  if (!Object.hasOwn(PREVIOUS, to)) return { allowed: false, reason: `unknown environment "${to}" (qa, staging or prod)` };
  if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/i.test(commit)) {
    return { allowed: false, reason: 'commit must be a full 40-character sha' };
  }
  if (touchesDataShape(changedFiles) && !(backwardCompatible === true && String(compatReason).trim() !== '')) {
    return { allowed: false, reason: 'stored-data shape changed (keys.ts or a table definition): needs backward_compatible=true and a reason' };
  }
  const isHotfix = typeof ref === 'string' && ref.startsWith('hotfix/');
  if (isHotfix && to === 'staging') {
    const h = hotfix ?? {};
    const missing = [['branchExists', 'the hotfix branch does not exist'], ['containsCommit', 'the hotfix branch does not contain the commit'],
      ['mainIsAncestor', 'main is not an ancestor of the hotfix branch']].filter(([k]) => h[k] !== true).map(([, t]) => t);
    if (missing.length) return { allowed: false, reason: `hotfix refused: ${missing.join('; ')}` };
    return { allowed: true, reason: 'hotfix: staging allowed without qa' };
  }

  const from = PREVIOUS[to];
  const sha = commit.toLowerCase();
  const mine = (Array.isArray(deployments) ? deployments : [])
    .filter((d) => d && normalizeEnvironment(d.environment).env === from && normalizeEnvironment(d.environment).role !== 'studio' && typeof d.sha === 'string' && d.sha.toLowerCase() === sha)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const ok = mine.filter((d) => d.state === 'success');
  if (ok.length === 0) {
    return { allowed: false, reason: mine.some((d) => FAILED.has(d.state)) ? `failed in ${from}` : `not yet in ${from}` };
  }
  const lastOk = Date.parse(ok[ok.length - 1].createdAt);
  if (mine.some((d) => FAILED.has(d.state) && Date.parse(d.createdAt) > lastOk)) return { allowed: false, reason: `failed in ${from}` };
  return { allowed: true, reason: `${sha.slice(0, 7)} succeeded in ${from}${from === 'dev' || from === 'qa' ? ' (api project; studio not required)' : ''}` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const deployments = JSON.parse(readFileSync(process.argv[2] ?? 0, 'utf8'));
  const r = checkPromotion({
    to: process.env.TO, commit: process.env.COMMIT, ref: process.env.REF ?? '', deployments,
    backwardCompatible: process.env.BACKWARD_COMPATIBLE === 'true', compatReason: process.env.COMPAT_REASON ?? '',
    changedFiles: process.env.CHANGED_FILES_FILE ? readFileSync(process.env.CHANGED_FILES_FILE, 'utf8').split('\n').filter(Boolean) : [],
    hotfix: { branchExists: process.env.BRANCH_EXISTS === 'true', containsCommit: process.env.CONTAINS_COMMIT === 'true', mainIsAncestor: process.env.MAIN_IS_ANCESTOR === 'true' },
  });
  console.log(r.reason);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `allowed=${r.allowed}\nreason=${r.reason}\n`);
  process.exit(r.allowed ? 0 : 1);
}
