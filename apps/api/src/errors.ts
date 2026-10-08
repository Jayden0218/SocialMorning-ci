// The single API error shape and its error codes with HTTP statuses.
/** The one error shape (contracts/api.md): `{ error, message }` plus a status. */
export type ErrorCode = 'validation' | 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict' | 'locked' | 'duration_unknown' | 'reply_depth' | 'self_follow' | 'unavailable' | 'suspended' | 'blocked' | 'removed'
  // M11 — the Studio (specs/011-m11-studio/contracts/studio-api.md)
  | 'session_expired' | 'csrf' | 'no_role' | 'owner_only' | 'muted_on_show'
  // M12 (specs/012-m12-the-finish/contracts/api.md)
  | 'own_comment' | 'storage_off' | 'too_large'
  // M15 — Admin (specs/015-m15-admin/contracts/admin-api.md)
  | 'signed_out' | 'reauth' | 'not_admin' | 'changed' | 'storage_full'
  // M20 (specs/021-m20-the-gaps/contracts/api.md): the store has not taken the payment; a paid episode not bought
  | 'not_paid' | 'needs_purchase'
  // M21 (specs/022-m21-the-xiaoyuzhou-gaps/contracts/api.md): a first comment waits for the community rules
  | 'rules_required'
  // M22 lane 5 (specs/023-m22-the-xiaoyuzhou-gaps-2/contracts/api.md): bans, translation, gifts
  | 'is_cohost' | 'plus_required' | 'not_offered' | 'already_claimed' | 'already_owned' | 'cancelled'
  // M23 US6: someone's subscriptions are private (was a hand-written 403 in routes/social/profiles.ts)
  | 'private'
  // M24 US8: the host closed comments on this show or episode
  | 'comments_closed'
  // M24 lane A1: a blocked word; the server is under maintenance
  | 'blocked_word' | 'maintenance';

const STATUS: Record<ErrorCode, number> = {
  validation: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  locked: 429,
  duration_unknown: 409,
  reply_depth: 422,
  self_follow: 422,
  unavailable: 503,
  suspended: 403,
  blocked: 403,
  removed: 410,
  session_expired: 401,
  csrf: 403,
  no_role: 403,
  owner_only: 403,
  muted_on_show: 403,
  own_comment: 403,
  storage_off: 503,
  too_large: 413,
  signed_out: 401,
  reauth: 401,
  not_admin: 403,
  changed: 409,
  storage_full: 409,
  not_paid: 402,
  needs_purchase: 402,
  rules_required: 428,
  is_cohost: 409,
  plus_required: 403,
  not_offered: 404,
  already_claimed: 409,
  already_owned: 409,
  cancelled: 410,
  private: 403,
  comments_closed: 403,
  blocked_word: 422,
  maintenance: 503,
};

export class ApiError extends Error {
  readonly status: number;
  constructor(readonly code: ErrorCode, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
    this.status = STATUS[code];
  }
  body() {
    return { error: this.code, message: this.message, ...this.extra };
  }
}
