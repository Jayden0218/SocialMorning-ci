/**
 * M8 — why an episode is in the list (FR-026, FR-024).
 *
 * A reason is how a listener decides whether to trust the list, how a screen-reader user
 * gets the same information, and the only way the device gate can be checked by a human
 * at all — a plausible-looking list of episodes proves nothing.
 *
 * Two rules:
 *   • It NEVER names another listener. It may state a count.
 *   • A reason that has been shortened must still be TRUE. So shortening drops the tail
 *     clause rather than cutting mid-fact: "Because you follow The Very Long Show Name…"
 *     becomes "Because you follow this show", not "Because you follow The Very Lo…".
 */
import type { Channel } from './rank.ts';

export const REASON_MAX = 60;

export type ReasonContext = {
  showTitle: string;
  genreName?: string;
  /** For `showcf`: a show the listener already likes that led here. */
  neighbourOf?: string;
  /** For `social`: how many people they follow engaged with it. */
  socialCount?: number;
};

/** The fallback for each channel — short enough that it never needs shortening. */
const SHORT: Record<Channel, string> = {
  'sub-new': 'New from a show you follow',
  showcf: 'Like a show you follow',
  social: 'People you follow listened',
  genre: 'New in a category you listen to',
  talked: 'Talked about this week',
  pick: 'Picked today',
  chart: 'Climbing the chart',
};

export function reasonFor(channel: Channel, ctx: ReasonContext): string {
  const long = ((): string => {
    switch (channel) {
      case 'sub-new': return `New from ${ctx.showTitle}`;
      case 'showcf': return ctx.neighbourOf === undefined ? SHORT.showcf : `Because you follow ${ctx.neighbourOf}`;
      case 'social': {
        const n = ctx.socialCount ?? 0;
        if (n <= 0) return SHORT.social;
        return `${n} ${n === 1 ? 'person' : 'people'} you follow listened`;
      }
      case 'genre': return ctx.genreName === undefined ? SHORT.genre : `New in ${ctx.genreName}`;
      case 'talked': return SHORT.talked;
      case 'pick': return SHORT.pick;
      /* istanbul ignore next — the remaining channel; kept explicit so a new one is a compile error */
      case 'chart': return SHORT.chart;
    }
  })();
  // Too long ⇒ fall back to the channel's short form, which is still true. Never a cut.
  return long.length <= REASON_MAX ? long : SHORT[channel];
}
