/** M12 FR-102: the names under a "Friends are listening" row. */
/** "Ana", "Ana and Bo", "Ana, Bo and 3 others". */
export function whoListened(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest} ${rest === 1 ? 'other' : 'others'}`;
}
