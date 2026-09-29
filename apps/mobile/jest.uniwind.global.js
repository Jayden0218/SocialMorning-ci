/**
 * M9 (research R1): compile `global.css` once per run, the way UniWind's Metro
 * transformer does (uniwind 1.12.0, src/bundler/adapters/metro/transformer.ts), and write
 * the module it would have produced. `jest.uniwind.js` runs it in every test file, so a
 * test that reads `props.style` reads what the phone gets — not `{}` (guard G8).
 *
 * UniWind has no Jest support and this uses its compiled internals (`dist/common/bundler`),
 * which is why `uniwind` is pinned exactly in package.json.
 */
const fs = require('node:fs');
const path = require('node:path');

const UNIWIND = path.dirname(require.resolve('uniwind/package.json'));
const OUT = path.join(__dirname, 'node_modules', '.cache', 'uniwind-jest.js');

/**
 * `dist/common` keeps UniWind's `@/` alias for its own root unresolved (its Metro plugin
 * is bundled, these files are not). Resolve it the way its build would: `@/x` → `dist/common/x`.
 */
const Module = require('node:module');
const DIST = path.join(UNIWIND, 'dist', 'common');
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith('@/') && parent?.filename?.startsWith(DIST + path.sep)) {
    return resolveFilename.call(this, path.join(DIST, request.slice(2)), parent, ...rest);
  }
  return resolveFilename.call(this, request, parent, ...rest);
};

module.exports = async () => {
  const { UniwindBundlerConfig } = require(path.join(UNIWIND, 'dist/common/bundler/config.js'));
  const { compileCSS } = require(path.join(UNIWIND, 'dist/common/bundler/css-compiler/index.js'));
  const cwd = process.cwd();
  process.chdir(__dirname); // UniWind resolves cssEntryFile against the working directory
  try {
    const config = UniwindBundlerConfig.fromMetroConfig({ cssEntryFile: './global.css' }, 'android');
    await config.generateArtifacts(path.join(UNIWIND, 'uniwind.css'));
    const virtualCode = await compileCSS(config);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(
      OUT,
      // The SAME runtime the components read (src/components/native/useStyle.ts →
      // src/core), not the package's default `dist` build — two copies means styles are
      // loaded into one store and read from another (UniWind's own tests do the same).
      `const { Uniwind } = require(${JSON.stringify(path.join(UNIWIND, 'src', 'core', 'config', 'config.native.ts'))});\n` +
        `Uniwind.__reinit(rt => ${virtualCode}, ${config.stringifiedThemes});\n`,
    );
  } finally {
    process.chdir(cwd);
  }
};
module.exports.OUT = OUT;
