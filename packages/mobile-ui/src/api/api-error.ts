/** A failed API call, carrying the server's sentence and any field messages. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | undefined,
    readonly fieldErrors: Readonly<Record<string, string>>,
  ) {
    super(message);
  }
}

/** The phone could not reach OneOhm (offline, timeout, server down). */
export class NetworkError extends ApiError {
  constructor() {
    super(0, 'Could not reach OneOhm. Check your connection and try again.', 'network', {});
  }
}

export function apiErrorFrom(status: number, body: unknown): ApiError {
  const data = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const message =
    typeof data.message === 'string' ? data.message : 'Something went wrong. Please try again.';
  const fieldErrors =
    typeof data.fieldErrors === 'object' && data.fieldErrors !== null
      ? (data.fieldErrors as Record<string, string>)
      : {};
  return new ApiError(
    status,
    message,
    typeof data.code === 'string' ? data.code : undefined,
    fieldErrors,
  );
}

/** A readable sentence for any thrown value. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

/** Field messages from an API error (empty for anything else). */
export function fieldErrorsOf(error: unknown): Readonly<Record<string, string>> {
  return error instanceof ApiError ? error.fieldErrors : {};
}
