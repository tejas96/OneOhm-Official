/** A failed API call, carrying the server's safe sentence and any field messages. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | undefined,
    readonly fieldErrors: Readonly<Record<string, string>>,
    /** Facts for a next step, like who already holds a mobile number. */
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
  }
}

export function toApiError(status: number, body: unknown): ApiError {
  const data = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const message =
    typeof data.message === 'string' ? data.message : 'Something went wrong. Please try again.';
  const fieldErrors =
    typeof data.fieldErrors === 'object' && data.fieldErrors !== null
      ? (data.fieldErrors as Record<string, string>)
      : {};
  const details =
    typeof data.details === 'object' && data.details !== null
      ? (data.details as Record<string, unknown>)
      : {};
  return new ApiError(
    status,
    message,
    typeof data.code === 'string' ? data.code : undefined,
    fieldErrors,
    details,
  );
}

export function networkError(): ApiError {
  return new ApiError(
    0,
    'Could not reach OneOhm. Check your connection and try again.',
    'network',
    {},
  );
}

/** A readable sentence for any thrown value. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
