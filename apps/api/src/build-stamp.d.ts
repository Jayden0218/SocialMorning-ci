// M30 T080: constants esbuild bakes in at bundle time (`--define`). Absent when the source runs unbundled (tests, tsx),
// so every read is behind `typeof … !== 'undefined'`.
declare const __BUILD_COMMIT__: string | undefined;
declare const __BUILD_TIME__: string | undefined;
