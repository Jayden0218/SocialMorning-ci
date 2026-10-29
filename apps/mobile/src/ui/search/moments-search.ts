// Which Moments match a search term: by episode, show or what people said.
/**
 * M31 T030 (design-pulse2 `search--results-moments`: "moments whose comments or episode match the term").
 * There is no server search over moments (the contract is `GET /v1/discover/moments`, the hottest ones), so
 * the Moments tab filters the list the Moments feed already reads, on the phone. A moment matches when the
 * term is in its episode's title, its show's title or one of its comments (any case). The line shown on its
 * tile is the first comment that matches the term, else the first comment, else nothing.
 */
import type { Moment } from '@/discover/moments-api';

export type MomentHit = { moment: Moment; line: string };

export function momentsMatching(items: readonly Moment[], term: string): MomentHit[] {
  const t = term.trim().toLowerCase();
  if (t === '') return [];
  const out: MomentHit[] = [];
  for (const moment of items) {
    const said = moment.comments.find((c) => c.text.toLowerCase().includes(t));
    const inTitle = moment.episodeTitle.toLowerCase().includes(t) || moment.showTitle.toLowerCase().includes(t);
    if (!said && !inTitle) continue;
    out.push({ moment, line: (said ?? moment.comments[0])?.text ?? '' });
  }
  return out;
}
