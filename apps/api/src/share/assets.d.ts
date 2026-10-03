// Type declarations so font and WebAssembly files import as bytes.
// esbuild inlines these as bytes (`--loader:.wasm=binary --loader:.woff=binary` in `npm run build`);
// under tsx the import fails and `card.ts` reads the same file from node_modules instead.
declare module '*.wasm' { const bytes: Uint8Array; export default bytes; }
declare module '*.woff' { const bytes: Uint8Array; export default bytes; }
