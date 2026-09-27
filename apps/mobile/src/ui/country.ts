/** M10b US7 — a two-letter country code as a name ("MY" → "Malaysia"); the code itself when the phone cannot name it. */
export function countryName(code: string, locale = 'en'): string {
  try {
    const D = (Intl as unknown as { DisplayNames?: new (l: string[], o: { type: 'region' }) => { of(c: string): string | undefined } }).DisplayNames;
    return (D ? new D([locale], { type: 'region' }).of(code) : undefined) ?? code;
  } catch {
    return code;
  }
}
