/** A send that will never succeed as is (bad number, unknown template): do not retry. */
export class PermanentSendError extends Error {
  /**
   * `code` is the provider's own error code, e.g. Meta's 131026 for "not on WhatsApp".
   * `tokenInvalid` means no WhatsApp message can go out until the token is replaced.
   */
  constructor(
    message: string,
    readonly code: number | null = null,
    readonly tokenInvalid = false,
  ) {
    super(message);
  }
}

/** Rate limits and server errors are worth retrying; other client errors are not. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Meta sends these back as a 400, yet they pass: rate limit (130429), too many to one
 * person (131056), spam limit (131048) and its generic "try again" (131000).
 */
const RETRYABLE_META_CODES: ReadonlySet<number> = new Set([130429, 131056, 131048, 131000]);
/** Meta's "access token expired or invalid". */
const TOKEN_INVALID_CODE = 190;

/** The error a refused WhatsApp send throws: a plain Error is retried, the other is not. */
export function metaSendFailure(
  status: number,
  error: { readonly message?: string; readonly code?: number } | undefined,
): Error {
  const reason = `WhatsApp ${status}: ${error?.message ?? 'request failed'}`;
  const code = error?.code ?? null;
  if (status === 401 || code === TOKEN_INVALID_CODE)
    return new PermanentSendError(reason, code, true);
  if (isRetryableStatus(status) || (code !== null && RETRYABLE_META_CODES.has(code)))
    return new Error(reason);
  return new PermanentSendError(reason, code);
}

export const MAYBE_SENT =
  'WhatsApp did not answer in time: this message may have been sent — check before resending.';

/**
 * A send with no answer. After a timeout Meta may already have the message, so it is
 * never sent again on its own (a second copy costs money and confuses the customer).
 * A network error before any answer, such as a refused connection, is retried.
 */
export function whenNoAnswer(error: unknown): Error {
  const name = error instanceof Error ? error.name : '';
  if (name === 'TimeoutError' || name === 'AbortError') return new PermanentSendError(MAYBE_SENT);
  return error instanceof Error ? error : new Error(String(error));
}
