/** What went wrong on a platform, in a shape the UI can explain. */
export type PlatformErrorKind =
  /** The token expired or was taken back: reconnect. */
  | 'auth'
  /** A permission or approval is still missing (Meta App Review, Google developer token). */
  | 'permission'
  /** The account cannot run ads now (disabled, unpaid, in review). */
  | 'account'
  /** A placement or feature is not open for this account (WhatsApp Status, Customer Match). */
  | 'not_available'
  /** The platform refused what we sent (text too long, image too small). */
  | 'invalid'
  /** Too many calls: try later. */
  | 'rate'
  /** Network or platform outage: try later. */
  | 'temporary';

/** A platform's refusal, with plain words for the owner and the raw detail for the log. */
export class PlatformError extends Error {
  constructor(
    readonly kind: PlatformErrorKind,
    /** Plain words the card shows. */
    message: string,
    /** The platform's own code and words, for the log. */
    readonly detail: string | null = null,
  ) {
    super(message);
    this.name = 'PlatformError';
  }

  /** A retry later may work. */
  get retryable(): boolean {
    return this.kind === 'rate' || this.kind === 'temporary';
  }
}

/** Plain words for any thrown value (a `PlatformError` keeps its own). */
export function plainError(error: unknown): string {
  if (error instanceof PlatformError) return error.message;
  return 'Something went wrong on our side. Please try again in a few minutes.';
}

/** The detail to log for any thrown value. */
export function errorDetail(error: unknown): string {
  if (error instanceof PlatformError) return `${error.kind}: ${error.detail ?? error.message}`;
  return error instanceof Error ? error.message : String(error);
}
