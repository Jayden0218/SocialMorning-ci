// Bundles the two Lambda functions (API, worker) into zips the deploy workflows upload, and checks their size.
/**
 * M27 (specs/028-m27-aws-infra, research R5). Same esbuild settings as `npm run build` (the Vercel bundle): one ESM file per
 * function, Node 22, the wasm/woff loaders, the `createRequire` banner. Each zip holds ONE file, `index.mjs`, at its root, so the
 * handler is `index.handler`. Direct upload (UpdateFunctionCode) takes a zip up to 50 MB (NOT re-checked, 2026-10-12);
 * this script fails at 40 MB so there is room.
 *
 * Usage: tsx scripts/build-lambda.ts          → dist-lambda/{api,worker}/index.mjs, dist-lambda/{api,worker}.zip
 * Env:   LAMBDA_ZIP_LIMIT_BYTES               → override the limit (the guard test lowers it).
 */
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}dist-lambda`;
export const DEFAULT_LIMIT = 40 * 1024 * 1024;

/** A zip with one deflated file at its root (no zip tool needed; the runners and the sessions differ). */
export function zipOne(name: string, data: Buffer): Buffer {
  const body = deflateRawSync(data, { level: 9 });
  const nameBuf = Buffer.from(name);
  const crc = crc32(data);
  // Fixed timestamp (1980-01-01) so the same code gives the same zip, hence the same SHA-256.
  const header = (central: boolean): Buffer => {
    const h = Buffer.alloc(central ? 46 : 30);
    let o = 0;
    h.writeUInt32LE(central ? 0x02014b50 : 0x04034b50, o); o += 4;
    if (central) { h.writeUInt16LE(0x031e, o); o += 2; }
    h.writeUInt16LE(20, o); o += 2; // version needed
    h.writeUInt16LE(0, o); o += 2; // flags
    h.writeUInt16LE(8, o); o += 2; // deflate
    h.writeUInt16LE(0, o); o += 2; // time
    h.writeUInt16LE(0x21, o); o += 2; // date 1980-01-01
    h.writeUInt32LE(crc, o); o += 4;
    h.writeUInt32LE(body.length, o); o += 4;
    h.writeUInt32LE(data.length, o); o += 4;
    h.writeUInt16LE(nameBuf.length, o); o += 2;
    h.writeUInt16LE(0, o); o += 2; // extra
    if (central) { h.writeUInt16LE(0, o); o += 2; h.writeUInt16LE(0, o); o += 2; h.writeUInt16LE(0, o); o += 2; h.writeUInt32LE((0o100644 << 16) >>> 0, o); o += 4; h.writeUInt32LE(0, o); }
    return h;
  };
  const local = Buffer.concat([header(false), nameBuf, body]);
  const central = Buffer.concat([header(true), nameBuf]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, end]);
}

async function bundle(entry: string, outfile: string): Promise<void> {
  await build({
    entryPoints: [`${ROOT}src/${entry}`], bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile,
    loader: { '.wasm': 'binary', '.woff': 'binary' },
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: 'error',
  });
}

export async function buildLambda(limit = Number(process.env['LAMBDA_ZIP_LIMIT_BYTES']) || DEFAULT_LIMIT): Promise<{ name: string; bytes: number; sha256: string }[]> {
  rmSync(OUT, { recursive: true, force: true });
  const report: { name: string; bytes: number; sha256: string }[] = [];
  for (const [name, entry] of [['api', 'lambda-entry.ts'], ['worker', 'worker-entry.ts']] as const) {
    mkdirSync(`${OUT}/${name}`, { recursive: true });
    await bundle(entry, `${OUT}/${name}/index.mjs`);
    const zip = zipOne('index.mjs', readFileSync(`${OUT}/${name}/index.mjs`));
    writeFileSync(`${OUT}/${name}.zip`, zip);
    report.push({ name, bytes: zip.length, sha256: createHash('sha256').update(zip).digest('hex') });
  }
  for (const r of report) console.log(`${r.name}.zip  ${(r.bytes / 1024 / 1024).toFixed(2)} MB  sha256 ${r.sha256}`);
  const over = report.filter((r) => r.bytes > limit);
  if (over.length) throw new Error(`zip over the limit of ${limit} bytes: ${over.map((r) => `${r.name} (${r.bytes})`).join(', ')}`);
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  buildLambda().catch((e: Error) => { console.error(e.message); process.exit(1); });
}
