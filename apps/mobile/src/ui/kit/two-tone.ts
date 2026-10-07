// Splits a section title into first word and the rest, for two colours.
/** M12 FR-055: splits a section title for the two-tone style; one word stays all accent. */
export function twoTone(title: string): { lead: string; rest: string } {
  const at = title.indexOf(' ');
  return at <= 0 ? { lead: '', rest: title } : { lead: title.slice(0, at), rest: title.slice(at) };
}
