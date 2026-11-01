/** A failed API call, carrying the server's safe sentence and any field messages. */
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

export function toApiError(status: number, body: unknown): ApiError {
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
