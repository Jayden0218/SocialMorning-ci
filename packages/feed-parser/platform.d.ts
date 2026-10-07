// The only runtime API the feed parser's source may use beyond the language: URL, which both Node and React Native have.
// Read by tsconfig.src.json only (M23 T054). Just the members src/ uses; add one only if both runtimes have it.
declare class URL {
  constructor(url: string, base?: string);
  toString(): string;
}
