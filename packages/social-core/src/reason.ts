// Writes the short, true reason why each recommended episode is shown.
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
  /**
   * Owner, 2026-10-05: which wording to use — the list passes each row's place among the rows of
   * its channel, so seven new episodes do not all read "New from …". Absent → the first wording.
   */
  variant?: number;
};

/**
 * The wordings of each reason, every one as true as the first. Picked by `variant`, in turn;
 * a wording too long for REASON_MAX falls back to the channel's short form like any other.
 */
const SUB_NEW = [
  (s: string) => `New from ${s}`,
  (s: string) => `${s} just posted this`,
  (s: string) => `The latest from ${s}`,
  (s: string) => `Fresh from ${s}`,
  (s: string) => `Out now on ${s}`,
  (s: string) => `A new one from ${s}`,
];
const SHOWCF = [
  (s: string) => `Because you follow ${s}`,
  (s: string) => `Listeners of ${s} like this`,
  (s: string) => `If you like ${s}`,
];
const SOCIAL = [
  (n: number) => `${n} ${n === 1 ? 'person' : 'people'} you follow listened`,
  (n: number) => `Heard by ${n} ${n === 1 ? 'person' : 'people'} you follow`,
  (n: number) => `${n} of your follows played this`,
];
const GENRE = [
  (g: string) => `New in ${g}`,
  (g: string) => `Fresh in ${g}`,
  (g: string) => `Because you listen to ${g}`,
];
const TALKED = ['Talked about this week', 'Listeners here are talking about it', 'Busy in the comments this week'];
const PICK = ['Picked today', "Today's editor's pick", 'Chosen by our editors'];
const CHART = ['Climbing the chart', 'Trending on the chart', 'Popular on the chart right now'];

const nth = <T>(list: readonly T[], v: number | undefined): T => list[Math.abs(Math.trunc(v ?? 0)) % list.length]!;

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
  const v = ctx.variant;
  const long = ((): string => {
    switch (channel) {
      case 'sub-new': return nth(SUB_NEW, v)(ctx.showTitle);
      case 'showcf': return ctx.neighbourOf === undefined ? SHORT.showcf : nth(SHOWCF, v)(ctx.neighbourOf);
      case 'social': {
        const n = ctx.socialCount ?? 0;
        if (n <= 0) return SHORT.social;
        return nth(SOCIAL, v)(n);
      }
      case 'genre': return ctx.genreName === undefined ? SHORT.genre : nth(GENRE, v)(ctx.genreName);
      case 'talked': return nth(TALKED, v);
      case 'pick': return nth(PICK, v);
      /* istanbul ignore next — the remaining channel; kept explicit so a new one is a compile error */
      case 'chart': return nth(CHART, v);
    }
  })();
  // Too long ⇒ fall back to the channel's short form, which is still true. Never a cut.
  return long.length <= REASON_MAX ? long : SHORT[channel];
}
