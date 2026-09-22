/** The one error shape (contracts/api.md): `{ error, message }` plus a status. */
export type ErrorCode = 'validation' | 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict' | 'locked' | 'duration_unknown' | 'reply_depth' | 'self_follow' | 'unavailable';

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
