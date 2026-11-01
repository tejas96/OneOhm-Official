/** Expected business errors: a safe sentence for people, mapped to an HTTP status. */
export class AppError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 429,
    message: string,
    readonly code: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, `${what} was not found.`, 'not_found');
export const forbidden = (message = 'You do not have permission to do this.') =>
  new AppError(403, message, 'forbidden');
export const unauthenticated = (message = 'Your session has ended. Please sign in again.') =>
  new AppError(401, message, 'unauthenticated');
export const conflict = (message: string, code = 'conflict') => new AppError(409, message, code);
export const invalid = (message: string, fieldErrors?: Record<string, string>) =>
  new AppError(400, message, 'invalid', fieldErrors);
export const tooMany = (message: string) => new AppError(429, message, 'too_many');
